import dotenv from 'dotenv';
dotenv.config();

import express from "express";
import { connectDB } from "./lib/db.js";
import authRoute from "./routes/auth.route.js"
import cors from 'cors';
import cookieParser from 'cookie-parser';


const app = express();
app.use(cors({ origin: 'http://localhost:3000' , credentials: true }));

// Middleware to parse JSON
app.use(express.json());

app.use(cookieParser());

// Optional: Middleware to parse URL-encoded form data
app.use(express.urlencoded({ extended: true }));


app.use("/api",authRoute)



app.listen(8080, () => {
    console.log("server is running on the 8080");
    connectDB();
});
