const express = require("express");
const router = express.Router();

router.get("/signup", (req, res) => {
	res.render("learnerSignup");
});

router.post("/signup", (req, res) => {
	// Handle learner signup logic
	res.redirect("/parent/dashboard");
});

module.exports = router;
