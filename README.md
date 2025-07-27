# 🧠 LangAgentSupervisor

LangAgentSupervisor is a TypeScript-based chatbot that uses **LangGraphJS**, **OpenAI**, **Anthropic**, and **MongoDB Atlas Vector Search** to answer HR-related questions about employees in a fictional software development company. Users can ask natural language questions and get semantically matched employee data from a vector-indexed MongoDB collection.

---

## 📦 Requirements

- **Node.js** (v14 or later)
- **MongoDB Atlas** account
- An open **MongoDB Atlas** project with one running cluster
- **OpenAI API key** (with at least $5 credits): [Get API Key](https://platform.openai.com/api-keys)
- **Anthropic API key** (with at least $5 credits): [Get API Key](https://console.anthropic.com/settings/keys)

---

## 🚀 Setup Instructions

1. **Clone the repository and install dependencies**

   ```bash
   npm install
   ```

2. **Rename your environment file**
   Rename `.env.example` to `.env`, and add your API keys and MongoDB URI:

   ```env
   OPENAI_API_KEY=your_openai_key
   ANTHROPIC_API_KEY=your_anthropic_key
   MONGODB_ATLAS_URI=your_mongodb_connection_string
   ```

3. **Seed the MongoDB database**
   Run the script to populate the `employees` collection with sample documents and 1536-dimensional vector embeddings:

   ```bash
   npx ts-node seed-database.ts
   ```

4. **Create a Vector Search index in MongoDB Atlas**
   Go to **SERVICES → Atlas Search → + CREATE SEARCH INDEX**, and create a vector index with the following definition:

   ```json
   {
     "fields": [
       {
         "numDimensions": 1536,
         "path": "embedding",
         "similarity": "cosine",
         "type": "vector"
       }
     ]
   }
   ```

   - Database: `hr_database`
   - Collection: `employees`
   - Index name: `vector_index`

5. **Start the chatbot server**

   ```bash
   npx ts-node index.ts
   ```

6. **Send a query to the chatbot API**
   Make a POST request to the chatbot endpoint:
   ```bash
   curl -X POST http://localhost:3000/chat      -H "Content-Type: application/json"      -d '{"message": "Who is a software engineer familiar with Node.js?"}'
   ```

---

## 💬 Example Queries

- "Find a software engineer skilled in AWS."
- "Who is a data scientist with leadership experience?"
- "Show me employees with Python and machine learning skills."

---

## 🛠 Tech Stack

- [LangGraphJS](https://js.langchain.com/docs/langgraph)
- [MongoDB Atlas Vector Search](https://www.mongodb.com/atlas/vector-search)
- [OpenAI Embeddings (`text-embedding-ada-002`)](https://platform.openai.com/docs/guides/embeddings)
- [Anthropic Claude 3.5 Sonnet](https://docs.anthropic.com/claude)
- TypeScript, Node.js, ts-node

---

## 🧾 License

MIT License. This project is for educational and demonstration purposes only.
