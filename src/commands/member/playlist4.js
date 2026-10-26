import playlist from "./playlist.js";

export default {
  ...playlist,
  name: "playlist4",
  async execute(sock, msg, args) {
    return playlist.execute(sock, msg, ["video", ...args]);
  }
};
