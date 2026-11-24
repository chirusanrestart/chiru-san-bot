import test from "node:test";
import assert from "node:assert/strict";

import {
    buildMarriageCaption,
    resolveMarriageParticipants
} from "../src/commands/member/casar.js";
import { buildWeddingCardSvg, renderWeddingCard, renderWeddingCardWithFfmpeg } from "../src/services/weddingCard.js";

const groupJid = "120363000000000001@g.us";
const senderJid = "559911223344@s.whatsapp.net";
const partnerJid = "559922334455@s.whatsapp.net";

function createMessage({
    remoteJid = groupJid,
    participant = senderJid,
    fromMe = false,
    mentionedJid = [partnerJid]
} = {}) {
    return {
        key: { remoteJid, participant, fromMe },
        message: {
            extendedTextMessage: {
                text: ".casar @pessoa",
                contextInfo: { mentionedJid }
            }
        }
    };
}

test("resolves the author and the single mentioned participant", () => {
    assert.deepEqual(
        resolveMarriageParticipants(createMessage(), null),
        { ok: true, first: senderJid, second: partnerJid }
    );
});

test("uses the connected WhatsApp account as author for outgoing messages", () => {
    const message = createMessage({
        participant: null,
        fromMe: true
    });

    assert.deepEqual(
        resolveMarriageParticipants(message, "559911223344:17@s.whatsapp.net"),
        { ok: true, first: senderJid, second: partnerJid }
    );
});

test("requires the command to run inside a group", () => {
    const result = resolveMarriageParticipants(
        createMessage({ remoteJid: senderJid }),
        null
    );

    assert.deepEqual(result, { ok: false, reason: "group" });
});

test("requires exactly one mentioned participant", () => {
    assert.deepEqual(
        resolveMarriageParticipants(createMessage({ mentionedJid: [] }), null),
        { ok: false, reason: "mention" }
    );

    assert.deepEqual(
        resolveMarriageParticipants(createMessage({
            mentionedJid: [partnerJid, "559933445566@s.whatsapp.net"]
        }), null),
        { ok: false, reason: "mention" }
    );
});

test("rejects missing authors and self-marriage", () => {
    assert.deepEqual(
        resolveMarriageParticipants(createMessage({
            participant: null
        }), null),
        { ok: false, reason: "sender" }
    );

    assert.deepEqual(
        resolveMarriageParticipants(createMessage({
            mentionedJid: [senderJid]
        }), null),
        { ok: false, reason: "self" }
    );
});

test("formats a celebratory caption with both WhatsApp mentions", () => {
    assert.equal(
        buildMarriageCaption("Mel", senderJid, "Furina", partnerJid),
        [
            "💍 *CASAMENTO VIRTUAL CELEBRADO!*",
            "",
            "💕 *Mel* e *Furina* agora estão oficialmente casados!",
            "",
            "💌 @559911223344 + @559922334455",
            "",
            "🥂 Que nunca faltem carinho, risadas e memes nessa união.",
            "🌸 Felicidades aos recém-casados!"
        ].join("\n")
    );
});

test("builds a wedding card with embedded portraits and escaped display names", () => {
    const svg = buildWeddingCardSvg({
        firstName: "Mel & <script>",
        secondName: "Furina",
        firstPhoto: {
            buffer: Buffer.from("primeira-foto"),
            mimeType: "image/png"
        },
        secondPhoto: {
            buffer: Buffer.from("segunda-foto"),
            mimeType: "image/jpeg"
        },
        date: "24 de novembro de 2026"
    });

    assert.match(svg, /data:image\/png;base64,cHJpbWVpcmEtZm90bw==/);
    assert.match(svg, /data:image\/jpeg;base64,c2VndW5kYS1mb3Rv/);
    assert.match(svg, /Mel &amp; &lt;script&gt;/);
    assert.match(svg, /Furina/);
    assert.match(svg, /24 de novembro de 2026/);
    assert.match(svg, /clipPath/);
    assert.doesNotMatch(svg, /<script>/);
});

test("builds a card with initials when profile pictures are unavailable", () => {
    const svg = buildWeddingCardSvg({
        firstName: "Mel",
        secondName: "Pessoa 2",
        firstPhoto: null,
        secondPhoto: null,
        date: "24 de novembro de 2026"
    });

    assert.match(svg, />M</);
    assert.match(svg, />P</);
    assert.doesNotMatch(svg, /data:image\//);
});


test("renders the wedding card into a real PNG image", async () => {
    const svg = buildWeddingCardSvg({
        firstName: "Mel",
        secondName: "Furina",
        firstPhoto: null,
        secondPhoto: null,
        date: "24 de novembro de 2026"
    });

    const image = await renderWeddingCard(svg);

    assert.deepEqual(
        [...image.subarray(0, 8)],
        [137, 80, 78, 71, 13, 10, 26, 10]
    );
    assert.ok(image.length > 1000);
});


test("FFmpeg fallback creates a wedding PNG with both available portraits", async t => {
    const tinyPng = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jW5kAAAAASUVORK5CYII=",
        "base64"
    );

    let image;
    try {
        image = await renderWeddingCardWithFfmpeg({
            firstName: "Mel",
            secondName: "Furina",
            firstPhoto: { buffer: tinyPng, mimeType: "image/png" },
            secondPhoto: { buffer: tinyPng, mimeType: "image/png" },
            date: "24 de novembro de 2026"
        });
    } catch (error) {
        if (error.code === "ENOENT") {
            t.skip("FFmpeg não está instalado neste ambiente de teste.");
            return;
        }
        throw error;
    }

    assert.deepEqual(
        [...image.subarray(0, 8)],
        [137, 80, 78, 71, 13, 10, 26, 10]
    );
    assert.ok(image.length > 1000);
});
