import Groq from "groq-sdk";

import personality from "./personality.js";

import {
    getUserMemory,
    saveUserMessage
} from "./memory.js";



const groq = new Groq({

    apiKey: process.env.GROQ_API_KEY

});




export async function askAI(
    userId,
    message
) {


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


}
