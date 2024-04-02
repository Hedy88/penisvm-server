import EventEmitter from "events";
import ChatMessage from "./chatMessage.js";

export default class Chat extends EventEmitter {
    private messages: ChatMessage[];

    constructor() {
        super();

        this.messages = [];
    }

    addMessage(message: ChatMessage) {
        this.messages.push(message);

        this.emit("newMessage", message);
    }

    getMessages() {
        return this.messages;
    }

    clearMessages() {
        this.messages = [];

        this.emit("clearMessages");
    }
}