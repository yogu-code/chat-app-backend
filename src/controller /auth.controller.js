import User from "../model/user.model.js";
import { validationResult } from "express-validator";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken"
import { configDotenv } from "dotenv";

configDotenv()
export const SignupController = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, name, password, confirmPassword } = req.body;
    console.log(email, password, name, confirmPassword);

    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required." });
    }
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: "user already exist" });
    }

    if (password !== confirmPassword) {
      return res
        .status(400)
        .json({ error: "Confirm password must match the password" });
    }

    const saltRounds = 10;
    const hash_password = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      position: "null",
      password: hash_password,
    });

    await user.save();

    return res.status(201).json({ message: "User registered successfully!" });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Something went wrong." });
  }
};

export const LoginController = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(email);
    if (!email || !password) {
      return res.status(400).json({ error: "All fields are required." });
    }

    console.log(password);
    const findUser = await User.findOne({ email: email });

    if (!findUser) {
      return res.status(400).json({ error: "User does not exist." });
    }

    const isPasswordValid = await bcrypt.compare(password, findUser.password);
    console.log(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Unauthorized user." });
    }

    // Optional: Generate a token here if needed
    const token = jwt.sign(
      { userId: findUser._id, email: findUser.email }, // Payload
      process.env.JWT_SECRET, // Secret key
      { expiresIn: "1d" } // Expiration
    );

    // Set cookie
    res.cookie("token", token, {
      httpOnly: true, // Prevents client-side JS from accessing the cookie
      secure: false, // Only send over HTTPS
      sameSite: "strict", // Mitigate CSRF
      maxAge: 24 * 60 * 60 * 1000, // 1 day in ms
    });
    

    return res.status(200).json({ message: "User logged in successfully." });
  } catch (error) {
    console.error("Error in LoginController:", error);
    return res.status(500).json({ message: "Server-side error." });
  }
};
