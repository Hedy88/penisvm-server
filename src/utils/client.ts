import { WebSocket } from "ws";
import { IP } from "./ip.js";
import { encodeText } from "./protocol.js";

interface ClientParams {
    ws: WebSocket,
    ip: IP,
    username?: string,
    bot?: boolean
}

export enum ClientRank {
    RegularUser = 0,
    AdminUser = 1,
}

export class Client {
    socket: WebSocket;
    ip: IP;
    userRank: ClientRank;
    connected: boolean;
    username?: string;
    bot?: boolean;

    pingNumber: number;
    sendPingInterval: NodeJS.Timeout;

    constructor(params: ClientParams) {
        this.socket = params.ws;
        this.ip = params.ip;
        this.connected = false;
        this.userRank = (this.getRank());
        this.pingNumber = 0;

        if (params.username) {
            this.username = params.username;
        };

        this.socket.on("close", () => {
            this.pingNumber = 0;
            clearInterval(this.sendPingInterval);
        });

        this.sendPingInterval = setInterval(() => this.sendPing(), 5000);
    }

    sendPing() {
        this.pingNumber = this.pingNumber + 1;

        this.socket.send(encodeText(JSON.stringify({
            type: "ping",
            pingNumber: this.pingNumber
        })));
    }

    sendMessage(msg: string | Buffer) {
        if (this.socket.readyState !== this.socket.OPEN) return;

        clearInterval(this.sendPingInterval);
        this.sendPingInterval = setInterval(() => this.sendPing(), 5000);

        this.socket.send(msg);
    }

    closeConnection() {
        this.socket.send(encodeText(JSON.stringify({ type: "disconnect" })));
        this.socket.close();
    }

    private getRank(): ClientRank {
        if (this.ip.address == "2.220.138.237") return ClientRank.AdminUser;
        if (this.ip.address == "::ffff:192.168.0.1") return ClientRank.AdminUser;

        return ClientRank.RegularUser;
    }
}