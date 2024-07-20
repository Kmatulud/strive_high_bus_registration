const express = require("express");
const router = express.Router();

router.get("/login", (req, res) => {
	res.render("adminLogin");
});

router.post("/login", (req, res) => {
	// Handle admin login logic
	res.redirect("/");
});

module.exports = router;
