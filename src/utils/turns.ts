import Queue from "./queue.js";
import { Client } from "./client.js";
import EventEmitter from "node:events";

export default class Turns extends EventEmitter {
  private turnQueue: Queue<Client>;
  private turnTime: number;
  private currentTurnRemainingTime: number;
  private turnInterval?: NodeJS.Timeout;

  constructor(turnTime: number) {
    super();

    this.turnQueue = new Queue();
    this.currentTurnRemainingTime = 0;
    this.turnTime = turnTime;
  }

  addUser(client: Client) {
    const currentQueue = this.turnQueue.toArray();
    if (currentQueue.indexOf(client) !== -1) return;

    this.turnQueue.enqueue(client);

    console.log(
      `adding ${
        client.username
      } to turn queue! queue size: ${this.turnQueue.size()}`
    );

    if (this.turnQueue.size() == 1) {
      this.nextTurn();
    }

    this.sendTurnUpdate();
  }

  removeUser(client: Client) {
    const hadTurn = (this.turnQueue.peek() === client);
    const previousQueue = this.turnQueue.toArray();

    // reset
    this.turnQueue.clear();

    previousQueue.forEach((previousQueuer) => {
      if (previousQueuer !== client) {
        this.turnQueue.enqueue(previousQueuer);
      }
    });

    console.log(`removing ${client.username} from the turn queue! queue size: ${this.turnQueue.size()}`);

    if (hadTurn) { 
        this.nextTurn() 
    } else {
        this.sendTurnUpdate() 
    };
  }

  currentUser(): Client | null {
    if (this.turnQueue.size() === 0) return null;
    if (this.turnQueue.size() !== 0) return this.turnQueue.peek();
  }

  processTurnInterval() {
    this.currentTurnRemainingTime--;

    if (this.currentTurnRemainingTime < 1) {
      this.turnQueue.dequeue();
      this.nextTurn();
    } else {
      this.sendTurnUpdate();
    }
  }

  nextTurn() {
    clearInterval(this.turnInterval);

    if (this.turnQueue.size() !== 0) {
      this.currentTurnRemainingTime = this.turnTime;
      this.turnInterval = setInterval(() => this.processTurnInterval(), 1000);
    }

    this.sendTurnUpdate();
  }

  sendTurnUpdate() {
    let currentUser = this.currentUser();
    
    this.emit("turnUpdate", {
      currentUser,
      secondsRemaining: this.currentTurnRemainingTime,
      queueSize: this.turnQueue.size(),
    });
  }

  clearQueue() {
    clearInterval(this.turnInterval);
    this.turnQueue.clear();
    this.sendTurnUpdate();

    console.log(`cleared turn queue!`);
  }

  checkIfInQueue(client: Client) {
    const turnQueueArray = this.turnQueue.toArray();

    if (turnQueueArray.indexOf(client) !== -1) {
        return true;
    } else {
        return false;
    }
  }
}
