import playlist from "./playlist.js";

export default {
  ...playlist,
  name: "playlist3",
  async execute(sock, msg, args) {
    return playlist.execute(sock, msg, ["audio", ...args]);
  }
};
