import express from "express";
import {
  LoginController,
  SignupController,
} from "../controller /auth.controller.js";
import { body, validationResult } from "express-validator";
const router = express.Router();

router.post("/signup", SignupController);

router.post("/login", LoginController);

export default router;
