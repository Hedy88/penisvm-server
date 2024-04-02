import PenisVMServer from "./utils/server.js";

new PenisVMServer({
    port: 4500,
    vnc: {
        host: "127.0.0.1",
        port: 5900
    },
    qmp: {
        port: 4444
    }
});