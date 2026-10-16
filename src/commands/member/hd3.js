import { executeHDVariant } from "../../utils/hd-command.js";

export default {
    name: "hd3",
    description: "HD com mais nitidez",
    async execute(sock, msg) {
        await executeHDVariant(sock, msg, "sharp");
    }
};
