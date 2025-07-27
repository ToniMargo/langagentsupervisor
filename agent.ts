import OpenAI from "openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { StateGraph } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { MongoClient } from "mongodb";
import { z } from "zod";
import "dotenv/config";

// ✅ Custom 768-dimensional embedding class using older ada-002
class LegacyAda002Embeddings {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async embedQuery(text: string): Promise<number[]> {
    const res = await this.client.embeddings.create({
      model: "text-embedding-ada-002",
      input: text,
    });
    return res.data[0].embedding;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const res = await this.client.embeddings.create({
      model: "text-embedding-ada-002",
      input: texts,
    });
    return res.data.map((d) => d.embedding);
  }
}

export async function callAgent(
  client: MongoClient,
  query: string,
  thread_id: string
) {
  const dbName = "hr_database";
  const db = client.db(dbName);
  const collection = db.collection("employees");

  const GraphState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
      reducer: (x, y) => x.concat(y),
    }),
  });

  // @ts-ignore
  const employeeLookupTool = tool(
    async ({ query, n = 10 }) => {
      console.log("🔍 Employee lookup tool called");
      console.log("➡️ Query received:", query);
      //console.log("🔢 Number of results requested:", n);

      const dbConfig = {
        collection: collection,
        indexName: "vector_index",
        textKey: "embedding_text",
        embeddingKey: "embedding",
      };

      //console.log("📁 DB Config:", dbConfig);

      const vectorStore = new MongoDBAtlasVectorSearch(
        new LegacyAda002Embeddings(process.env.OPENAI_API_KEY!),
        dbConfig
      );

      try {
        const result = await vectorStore.similaritySearchWithScore(query, n);
        console.log("✅ Vector search results:", result);
        return JSON.stringify(result);
      } catch (error) {
        console.error("❌ Error during vector search:", error);
        return JSON.stringify([{ error: "Vector search failed. See logs." }]);
      }
    },
    {
      name: "employee_lookup",
      description: "Gathers employee details from the HR database",
      schema: z.object({
        query: z.string().describe("The search query"),
        n: z
          .number()
          .optional()
          .default(10)
          .describe("Number of results to return"),
      }),
    }
  );

  const tools = [employeeLookupTool];

  // @ts-ignore
  const toolNode = new ToolNode<typeof GraphState.State>(tools);

  const model = new ChatAnthropic({
    model: "claude-3-5-sonnet-20240620",
    temperature: 0,
  }).bindTools(tools);

  async function callModel(state: typeof GraphState.State) {
    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are a helpful AI assistant, collaborating with other assistants. Use the provided tools to progress towards answering the question. If you are unable to fully answer, that's OK, another assistant with different tools will help where you left off. Execute what you can to make progress. If you or any of the other assistants have the final answer or deliverable, prefix your response with FINAL ANSWER so the team knows to stop. You have access to the following tools: {tool_names}.\n{system_message}\nCurrent time: {time}.`,
      ],
      new MessagesPlaceholder("messages"),
    ]);

    const formattedPrompt = await prompt.formatMessages({
      system_message: "You are helpful HR Chatbot Agent.",
      time: new Date().toISOString(),
      tool_names: tools.map((tool) => tool.name).join(", "),
      messages: state.messages,
    });

    const result = await model.invoke(formattedPrompt);
    return { messages: [result] };
  }

  function shouldContinue(state: typeof GraphState.State) {
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1] as AIMessage;

    if (lastMessage.tool_calls?.length) {
      return "tools";
    }
    return "__end__";
  }
  // prettier-ignore
  // @ts-ignore
  const workflow = new StateGraph(GraphState).addNode("agent", callModel).addNode("tools", toolNode).addEdge("__start__", "agent").addConditionalEdges("agent", shouldContinue).addEdge("tools", "agent");

  const checkpointer = new MongoDBSaver({ client, dbName });

  const app = workflow.compile({ checkpointer });

  const finalState = await app.invoke(
    {
      messages: [new HumanMessage(query)],
    },
    { recursionLimit: 15, configurable: { thread_id: thread_id } }
  );

  console.log(finalState.messages[finalState.messages.length - 1].content);

  return finalState.messages[finalState.messages.length - 1].content;
}
