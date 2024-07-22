const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const mysql = require("mysql2");
const dotenv = require("dotenv");
const morgan = require("morgan");

dotenv.config();

const app = express();

// Set EJS as templating engine
app.set("view engine", "ejs");

// Middleware
// app.use(morgan())
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
	if (err) {
		console.error("Error connecting to the database:", err);
		process.exit(1);
	}
	console.log("Connected to the MySQL server.");
});

// Routes
app.get("/", (req, res) => {
	res.render("index");
});

app.get("/admin/dashboard", (req, res) => {
	if (req.session.admin) {
		res.render("dashboard", { admin: req.session.admin });
	} else {
		res.redirect("/admin/dashboard");
	}
});

app.get("/admin/login", (req, res) => {
	res.render("adminLogin");
});

app.post("/admin/login", (req, res) => {
	const { initials_surname, email, password } = req.body;
	const sql =
		"SELECT * FROM administrator WHERE Initials_Surname = ? AND Email = ? AND Password = ?";
	connection.query(sql, [initials_surname, email, password], (err, results) => {
		if (err) {
			console.error("Error during admin login:", err);
			return res.send("Error during admin login.");
		}
		if (results.length > 0) {
			req.session.admin = results[0];
			res.redirect("/admin/dashboard");
		} else {
			res.send("Incorrect email or password");
		}
	});
});

app.get("/parent/signup", (req, res) => {
	res.render("parentSignup");
});

app.post("/parent/signup", (req, res) => {
	const { name_surname, cellPhoneNumber, email, password } = req.body;
	const query =
		"INSERT INTO parent (Name_Surname, CellPhoneNumber, Email, Password) VALUES (?, ?, ?, ?)";
	connection.query(
		query,
		[name_surname, cellPhoneNumber, email, password],
		(err, result) => {
			if (err) {
				console.error("Error inserting parent:", err);
				return res.send("Error inserting parent.");
			}
			res.redirect("/parent/login");
		}
	);
});

app.get("/parent/login", (req, res) => {
	res.render("parentLogin");
});

app.post("/parent/login", (req, res) => {
	const { name_surname, email, password } = req.body;
	const query =
		"SELECT * FROM parent WHERE Name_Surname =? AND Email = ? AND Password = ?";
	connection.query(query, [name_surname, email, password], (err, results) => {
		if (err) {
			console.error("Error during parent login:", err);
			return res.send("Error during parent login.");
		}
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

app.get("/learner/signup", (req, res) => {
	if (!req.session.parent) {
		return res.redirect("/parent/login"); // Redirect to parent login if not logged in
	}
	res.render("learnerSignup");
});

app.post("/learner/signup", (req, res) => {
	if (!req.session.parent) {
		return res.redirect("/parent/login");
	}

	const { name_surname, cellPhoneNumber, grade } = req.body;
	const parentId = req.session.parent.ParentID;

	// Ensure all required fields are present
	if (!name_surname || !cellPhoneNumber || !grade || !parentId) {
		return res.status(400).send("All fields are required.");
	}

	const query =
		"INSERT INTO learner (Name_Surname, CellPhoneNumber, Grade, ParentID) VALUES (?, ?, ?, ?)";

	connection.query(
		query,
		[name_surname, cellPhoneNumber, grade, parentId],
		(err, results) => {
			if (err) {
				console.error("Error inserting learner:", err);
				return res.send("Error inserting learner.");
			}
			res.send("Learner registered successfully!");
		}
	);
});

app.get("/learners", (req, res) => {
	const query = `
        SELECT learner.LearnerID, learner.Name_Surname as LearnerNameSurname, learner.CellPhoneNumber as LearnerCellPhoneNumber, learner.Grade,
               parent.Name_Surname as ParentNameSurname
        FROM learner
        JOIN parent ON learner.ParentID = parent.ParentID
    `;
	connection.query(query, (err, results) => {
		if (err) {
			console.error("Error fetching learners:", err);
			return res.send("Error fetching learners.");
		}
		res.render("learners", { learners: results });
	});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});
