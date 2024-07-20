const express = require("express");
const router = express.Router();

router.get("/signup", (req, res) => {
	res.render("parentSignup");
});

router.post("/signup", (req, res) => {
	// Handle parent signup logic
	res.redirect("/parent/login");
});

router.get("/login", (req, res) => {
	res.render("parentLogin");
});

router.post("/login", (req, res) => {
	// Handle parent login logic
	res.redirect("/learner/signup");
});

module.exports = router;
