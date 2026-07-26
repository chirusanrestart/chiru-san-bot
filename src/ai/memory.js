import fs from "fs";
import path from "path";

const file = path.resolve("src/data/memory.json");


function loadMemory() {

    if (!fs.existsSync("src/data")) {
        fs.mkdirSync("src/data", {
            recursive: true
        });
    }


    if (!fs.existsSync(file)) {
        fs.writeFileSync(
            file,
            "{}"
        );
    }


    return JSON.parse(
        fs.readFileSync(file, "utf8")
    );
}



function saveMemory(data) {

    fs.writeFileSync(
        file,
        JSON.stringify(
            data,
            null,
            2
        )
    );

}



export function getUserMemory(id) {

    const memory = loadMemory();


    if (!memory[id]) {

        memory[id] = {
            history: []
        };

        saveMemory(memory);
    }


    return memory[id];
}



export function saveUserMessage(
    id,
    user,
    ai
) {

    const memory = loadMemory();


    if (!memory[id]) {

        memory[id] = {
            history: []
        };

    }


    memory[id].history.push({

        user,

        ai,

        date: Date.now()

    });


    // guarda somente as últimas 10  mensagens
    memory[id].history =
        memory[id].history.slice(-10
);



    saveMemory(memory);

}
