// Adaptador de provedor: o sistema de personagens só depende desta função.
// Hoje usa o cliente Groq já configurado pelo projeto; outro provedor pode
// implementar a mesma assinatura sem alterar catálogo, armazenamento ou comandos.
import { generateChatCompletion } from "./groq.js";

export async function generateCharacterReply(messages) {
    return generateChatCompletion(messages);
}
