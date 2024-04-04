import PenisVMServer from "./server.js";

new PenisVMServer({
    port: 4500,
    serverName: "Windows 10 LTSB 2015",
    serverDescription: "that's crazy",
    vnc: {
        host: "127.0.0.1",
        port: 5900
    },
    qmp: {
        port: 4444
    }
});