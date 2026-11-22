import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "chiru-limitador-cli-")
);

const limitsFile = path.join(temporaryDirectory, "command-limits.json");
const groupJid = "120363000000000099@g.us";

function runLimitador(commands) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["limitador.js"], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                COMMAND_LIMITS_FILE: limitsFile
            },
            stdio: ["pipe", "pipe", "pipe"]
        });

        let stdout = "";
        let stderr = "";
        let groupJidSent = false;
        let responseIndex = 0;
        const responses = [...commands, "sair"];

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", chunk => {
            stdout += chunk;
            sendNextResponse();
        });
        child.stderr.on("data", chunk => {
            stderr += chunk;
        });

        function sendNextResponse() {
            if (
                !groupJidSent &&
                stdout.includes("🆔 Identificador do grupo: ")
            ) {
                groupJidSent = true;
                child.stdin.write(groupJid + "\n");
            }

            if (!groupJidSent) return;

            const promptCount = (stdout.match(/limitador> /g) || []).length;

            while (
                responseIndex < responses.length &&
                promptCount > responseIndex
            ) {
                child.stdin.write(responses[responseIndex] + "\n");
                responseIndex++;
            }
        }

        const timeout = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error("limitador.js não encerrou após receber 'sair'."));
        }, 30_000);

        child.once("error", error => {
            clearTimeout(timeout);
            reject(error);
        });

        child.once("close", code => {
            clearTimeout(timeout);

            if (code !== 0) {
                reject(new Error(
                    "limitador.js terminou com código " + code +
                    "\nSTDOUT:\n" + stdout +
                    "\nSTDERR:\n" + stderr
                ));
                return;
            }

            resolve(stdout);
        });
    });
}

test("CLI lists registered commands and persists OFF/ON changes", async () => {
    const offOutput = await runLimitador(["ping off"]);

    assert.match(offOutput, /\.ping/);
    assert.match(offOutput, /\.ping\s+→ OFF/i);

    const afterOff = JSON.parse(await fs.readFile(limitsFile, "utf8"));
    assert.deepEqual(afterOff, {
        [groupJid]: {
            ping: false
        }
    });

    const onOutput = await runLimitador(["ping on"]);
    assert.match(onOutput, /\.ping\s+→ ON/i);

    const afterOn = JSON.parse(await fs.readFile(limitsFile, "utf8"));
    assert.deepEqual(afterOn, {
        [groupJid]: {
            ping: true
        }
    });
});

test.after(async () => {
    await fs.rm(temporaryDirectory, {
        recursive: true,
        force: true
    });
});
