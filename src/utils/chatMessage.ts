import { Client } from "./client.js";

export default class ChatMessage {
    client?: Client;
    message: string;
    isSystem?: boolean;

    constructor(message: string, client?: Client, isSystem?: boolean) {
        this.client = client;
        this.message = message;

        if (isSystem) {
            this.isSystem = isSystem;
        }
    }
}