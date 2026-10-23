import { createApp } from "./src/app.js";

const PORT = Number(process.env.PORT || 3000);
const app = createApp();

app.listen(PORT, () => {
  console.log(`Chatbot running at http://localhost:${PORT}`);
});
