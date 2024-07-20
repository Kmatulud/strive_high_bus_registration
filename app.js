const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const mysql = require("mysql2");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

// Set EJS as templating engine
app.set("view engine", "ejs");

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "Public")));
app.use(
	session({
		secret: "your_secret_key",
		resave: false,
		saveUninitialized: true,
	})
);

// MySQL Connection
const connection = mysql.createConnection({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
});

connection.connect((err) => {
	if (err) throw err;
	console.log("Connected to the MySQL server.");
});

// Routes
app.get("/", (req, res) => {
	res.render("index");
});

const adminRoutes = require("./Routes/admin");
const parentRoutes = require("./Routes/parent");
const learnerRoutes = require("./Routes/learner");
const { log } = require("console");
const { Session } = require("inspector");

app.use("/admin", adminRoutes);
app.use("/parent", parentRoutes);
app.use("/learner", learnerRoutes);

app.get("/admin/login", (req, res) => {
	res.render("adminLogin");
});

app.post("/admin/login", (req, res) => {
	const { email, password } = req.body;
	const sql = "SELECT * FROM administrator WHERE Email = ? AND Password = ?";
	connection.query(sql, [email, password], (err, results) => {
		if (err) throw err;
		if (results.length > 0) {
			req.session.admin = results[0];
			res.redirect("/admin/dashboard");
		} else {
			res.send("Incorrect email or password");
		}
	});
});

app.get("/admin/dashboard", (req, res) => {
	if (req.session.admin) {
		res.render("admin_dashboard", { admin: req.session.admin });
	} else {
		res.redirect("/admin/login");
	}
});

app.get("/parent/signup", (req, res) => {
	res.render("parentSignup");
});

app.post("/parent/signup", (req, res) => {
	const { name, surname, cellPhoneNumber, email, password } = req.body;
	const sql =
		"INSERT INTO parent (Name, Surname, CellPhoneNumber, Email, Password) VALUES (?, ?, ?, ?, ?)";
	connection.query(
		sql,
		[name, surname, cellPhoneNumber, email, password],
		(err, result) => {
			if (err) throw err;
			res.redirect("/parent/login");
		}
	);
});

app.get("/parent/login", (req, res) => {
	res.render("parentLogin");
});

app.post("/parent/login", (req, res) => {
	const { email, password } = req.body;
	const sql = "SELECT * FROM parent WHERE Email = ? AND Password = ?";
	connection.query(sql, [email, password], (err, results) => {
		if (err) throw err;
		if (results.length > 0) {
			req.session.parent = results[0];
			res.redirect("/learner/signup");
		} else {
			res.send("Incorrect email or password");
		}
	});
});

app.get("/parent/dashboard", (req, res) => {
	if (req.session.parent) {
		res.render("parent_dashboard", { parent: req.session.parent });
	} else {
		res.redirect("/parent/login");
	}
});

// Route to render learner signup form
app.get("/learner/signup", (req, res) => {
	if (!req.session.ParentID) {
		return res.redirect("/parent/login"); // Redirect to parent login if not logged in
	}
	res.render("learnerSignup");
});

// Route to handle learner signup form submission
app.post("/learner/signup", (req, res) => {
	if (!req.session.ParentID) {
		return res.redirect("/parent/login"); // Redirect to parent login if not logged in
	}

	const { name, surname, grade } = req.body;
	const parentId = req.session.ParentID;
	const sql =
		"INSERT INTO learner (Name, Surname, Grade, ParentID) VALUES (?, ?, ?, ?)";
	connection.query(sql, [name, surname, grade, parentId], (err, result) => {
		if (err);
		console.log(err);
		res.redirect("/parent/dashboard");
	});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
    console.log(testsess);
});
