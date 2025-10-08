import { io } from "socket.io-client";

const socket = io("http://localhost:4000"); // Replace with actual server IP if hosted

export default socket;
