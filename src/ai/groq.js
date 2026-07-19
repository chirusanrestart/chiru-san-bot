import Groq from "groq-sdk";

import personality from "./personality.js";

import {
    getUserMemory,
    saveUserMessage
} from "./memory.js";


let groq = null;


const apiKey = process.env.GROQ_API_KEY;


if (apiKey && apiKey.trim().length > 0) {

    groq = new Groq({
        apiKey
    });

    console.log("🟢 IA Groq ativada!");

} else {

    console.log("⚠️ IA desativada: GROQ_API_KEY não configurada.");

}



export async function askAI(
    userId,
    message
) {


    if (!groq) {

        return "🌸 A IA está desativada no momento.";

    }



    const memory = getUserMemory(userId);



    const messages = [

        {
            role: "system",
            content: personality
        }

    ];



    for (const chat of memory.history) {


        messages.push({

            role: "user",

            content: chat.user

        });



        messages.push({

            role: "assistant",

            content: chat.ai

        });


    }



    messages.push({

        role: "user",

        content: message

    });



    try {


        const response =
            await groq.chat.completions.create({

                model:
                "openai/gpt-oss-120b",

                messages,

                temperature: 0.8,

                max_tokens: 2048

            });



        const answer =
            response.choices[0]
            .message.content;



        saveUserMessage(

            userId,

            message,

            answer

        );



        return answer;



    } catch (error) {


        console.error(
            "❌ Erro na IA:",
            error.message
        );


        return "🌸 Tive um probleminha para responder agora.";

    }


}
