import { WebSocketServer, WebSocket } from "ws";
import { Client, ClientRank } from "./client.js";
import { encodeImage, encodeText } from "./protocol.js";
import { IP } from "./ip.js";
import { Canvas } from "canvas";
import { IncomingMessage } from "http";

import VM from "./vm.js";
import Turns from "./turns.js";
import Chat from "./chat.js";
import ChatMessage from "./chatMessage.js";

interface PenisVMServerParams {
  port: number;
  vnc: {
    host: string;
    port: number;
  };
  qmp: {
    port: number;
  };
}

/**
 * Penis VM Server
 * @author RGB
 */
export default class PenisVMServer {
  private socketServer: WebSocketServer;
  private clients: Client[];
  private ips: IP[];
  private vm: VM;
  private turns: Turns;
  private chat: Chat;

  constructor(params: PenisVMServerParams) {
    this.socketServer = new WebSocketServer({
      port: params.port,
    });

    this.clients = [];
    this.ips = [];

    this.vm = new VM({ vnc: params.vnc, qmp: params.qmp });
    this.vm.start();

    this.turns = new Turns(30);
    this.chat = new Chat();

    // ws stuff
    this.socketServer.on("connection", (ws, req) => this.onConnection(ws, req));

    this.vm.on("dirtyrect", (rect, x, y) => this.newRect(rect, x, y));
    this.vm.on("size", (size) => this.updateSize(size));

    this.turns.on("turnUpdate", (turnInfo) =>
      this.sendTurnUpdateToClients(turnInfo)
    );

    this.chat.on("newMessage", (message) =>
      this.sendNewMessageToClients(message)
    );
  }

  private onConnection(ws: WebSocket, req: IncomingMessage) {
    // check if IP is in the this.ips array
    let ipDataCheck = this.ips.filter(
      (data) => data.address == req.socket.remoteAddress
    );
    let ipData: IP;

    if (ipDataCheck.length > 0) {
      ipData = ipDataCheck[0];
    } else {
      ipData = new IP(req.socket.remoteAddress);
      this.ips.push(ipData);
    }

    const client = new Client({
      ws,
      ip: ipData,
    });

    this.clients.push(client);

    ws.on("error", (error) => ws.close());
    ws.on("close", () => this.connectionClosed(client));
    ws.on("message", (data) => {
      let message;

      try {
        message = JSON.parse(data.toString());
      } catch (e) {
        client.closeConnection();
        return;
      }

      this.onMessage(client, message);
    });
  }

  private connectionClosed(client: Client) {
    // clean up
    this.clients.splice(this.clients.indexOf(client), 1);

    if (!client.username) return;

    this.turns.removeUser(client);

    this.clients.forEach((otherClient) => {
      otherClient.sendMessage(
        encodeText(
          JSON.stringify({
            type: "removeUser",
            username: client.username,
          })
        )
      );
    });
  }

  private onMessage(client: Client, message: any) {
    switch (message.type) {
      case "connect":
        if (client.connected) {
          client.closeConnection();
        }

        if (!client.username) {
          if (
            typeof message.username !== "undefined" &&
            typeof message.username == "string"
          ) {
            client.username = message.username;
          } else if (message.username.length == 0) {
            client.username = `Guest`;
          } else {
            client.closeConnection();
            return;
          }
        }

        client.connected = true;

        // send "addUser" opcode to all clients EXECPT the one that's just connnected
        this.clients
          .filter(
            (otherClient) =>
              otherClient.username != client.username && otherClient.connected
          )
          .forEach((otherClients) => {
            otherClients.sendMessage(
              encodeText(
                JSON.stringify({
                  type: "addUser",
                  username: client.username,
                  userRank: client.userRank,
                })
              )
            );
          });

        this.clients
          .filter((client) => client.connected == true)
          .forEach((otherClient) =>
            client.sendMessage(
              encodeText(
                JSON.stringify({
                  type: "addUser",
                  username: otherClient.username,
                  userRank: otherClient.userRank,
                })
              )
            )
          );

        // send size
        client.sendMessage(
          encodeText(
            JSON.stringify({
              type: "vgaSizeUpdate",
              width: this.vm.framebuffer.width,
              height: this.vm.framebuffer.height,
            })
          )
        );

        const sysGreetingMessage = new ChatMessage(
          `${client.username} has joined.`,
          null,
          true
        );

        this.chat.addMessage(sysGreetingMessage);

        const jpg = this.vm.framebuffer.toBuffer("image/jpeg", {
          quality: 0.5,
          progressive: true,
          chromaSubsampling: true,
        });

        client.sendMessage(encodeImage(jpg));
        this.turns.sendTurnUpdate();

        // not used on the offical client but bots might want it anyway
        client.sendMessage(encodeText(JSON.stringify({
          type: "connected"
        })))

        break;
      case "mouse":
        if (
          this.turns.currentUser() !== client &&
          client.userRank !== ClientRank.AdminUser
        )
          return;
        this.vm.pointerEvent(message.x, message.y, message.mask);
        break;
      case "key":
        if (
          this.turns.currentUser() !== client &&
          client.userRank !== ClientRank.AdminUser
        )
          return;
        this.vm.keyEvent(message.keyCode, message.down);
        break;
      case "turn":
        if (client.connected !== true) return;
        let takingTurn: boolean;

        if (message.takingTurn) {
          takingTurn = true;
        } else {
          takingTurn = false;
        }

        if (takingTurn) {
          this.turns.addUser(client);
        } else {
          this.turns.removeUser(client);
        }

        break;
      case "addMessage":
        const chatMessage = new ChatMessage(message.content, client);

        this.chat.addMessage(chatMessage);
        break;
      case "admin":
        if (client.userRank !== ClientRank.AdminUser) {
          client.sendMessage(encodeText(JSON.stringify({
            type: "notAllowed",
          })));
          return;
        }

        if (message.action == "clearTurns") {
          this.turns.clearQueue();
        };

        break;
    }
  }

  private sendTurnUpdateToClients(turnInfo: {
    currentUser: Client | null;
    secondsRemaining: number;
    queueSize: number;
  }) {
    this.clients
      .filter((client) => client !== turnInfo.currentUser && client.connected)
      .forEach((client) => {
        const isInQueue = this.turns.checkIfInQueue(client);

        if (isInQueue) {
          const secondsRemaining =
            turnInfo.secondsRemaining + (turnInfo.queueSize - 1) * 30;

          client.sendMessage(
            encodeText(
              JSON.stringify({
                type: "turnUpdate",
                secondsRemaining,
                queueSize: turnInfo.queueSize,
              })
            )
          );
        } else {
          client.sendMessage(
            encodeText(
              JSON.stringify({
                type: "turnUpdate",
                queueSize: turnInfo.queueSize,
              })
            )
          );
        }
      });

    if (turnInfo.currentUser !== null) {
      turnInfo.currentUser.sendMessage(
        encodeText(
          JSON.stringify({
            type: "yourTurn",
            secondsRemaining: turnInfo.secondsRemaining,
          })
        )
      );
    }
  }

  private sendNewMessageToClients(message: ChatMessage) {
    if (message.isSystem !== undefined && message.isSystem == true) {
      this.clients
        .filter((client) => client.connected == true)
        .forEach((client) => {
          client.sendMessage(
            encodeText(
              JSON.stringify({
                type: "newMessage",
                username: "system",
                content: message.message,
              })
            )
          );
        });

      return;
    }

    this.clients
      .filter((client) => client.connected == true)
      .forEach((client) => {
        client.sendMessage(
          encodeText(
            JSON.stringify({
              type: "newMessage",
              username: message.client.username,
              content: message.message,
            })
          )
        );
      });
  }

  // rects

  private async newRect(rect: Canvas, x: number, y: number) {
    const jpg = rect.toBuffer("image/jpeg", {
      quality: 0.5,
      progressive: true,
      chromaSubsampling: true,
    });

    this.clients.forEach((client) => {
      client.sendMessage(encodeImage(jpg));
    });
  }

  private updateSize(size: { width: number; height: number }) {
    this.clients.forEach((client) => {
      client.sendMessage(
        encodeText(
          JSON.stringify({
            type: "vgaSizeUpdate",
            width: size.width,
            height: size.height,
          })
        )
      );
    });
  }
}
