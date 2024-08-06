const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const mysql = require("mysql2");
const dotenv = require("dotenv");
const morgan = require("morgan");
const { log } = require("console");
const moment = require("moment"); 

dotenv.config();

const app = express();

// Set EJS as templating engine
app.set("view engine", "ejs");

// Middleware
app.use(morgan("dev"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "Public")));
app.use(
	session({
		secret: process.env.SESSION_SECRET,
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

// Parent actions
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
	const { email, password } = req.body;
	const query = "SELECT * FROM parent WHERE Email = ? AND Password = ?";
	connection.query(query, [email, password], (err, results) => {
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

// Learner actions
app.get("/learner/signup", (req, res) => {
	res.render("learnerSignup");
});

app.post("/learner/signup", (req, res) => {
	if (!req.session.parent) {
		return res.redirect("/parent/login");
	}

	const { name_surname, cellPhoneNumber, grade, registration_date } = req.body;
	const parentId = req.session.parent.ParentID;

	// Ensure all required fields are present
	if (
		!name_surname ||
		!cellPhoneNumber ||
		!registration_date ||
		!grade ||
		!parentId
	) {
		return res.status(400).send("All fields are required.");
	}

	const query =
		"INSERT INTO learner (Name_Surname, CellPhoneNumber, Grade, RegistrationDate, ParentID) VALUES (?, ?, ?, ?, ?)";

	connection.query(
		query,
		[name_surname, cellPhoneNumber, grade, registration_date, parentId],
		(err, results) => {
			if (err) {
				console.error("Error inserting learner:", err);
				return res.send("Error inserting learner.");
			}
			res.send("Learner registered successfully!");
		}
	);
});

app.get("/admin/dashboard", (req, res) => {
	if (!req.session.admin) {
		return res.redirect("/admin/login");
	}

	// Queries
	const monthlyQuery = `
        SELECT MONTH(RegistrationDate) AS period, COUNT(*) AS count 
        FROM learner WHERE MONTH(RegistrationDate) = MONTH(CURDATE())
        GROUP BY period
    `;

	const weeklyQuery = `
        SELECT YEARWEEK(RegistrationDate) AS period, COUNT(*) AS count 
        FROM learner WHERE YEARWEEK(RegistrationDate, 1) = YEARWEEK(CURDATE(), 1)
        GROUP BY period
    `;

	const dailyQuery = `
        SELECT DATE(RegistrationDate) AS period, COUNT(*) AS count 
        FROM learner WHERE DATE(RegistrationDate) = CURDATE()
        GROUP BY period
    `;

	const acceptedQuery = `
        SELECT COUNT(*) AS count 
        FROM learner 
        WHERE Status = 'Approved'
    `;

	const waitingListQuery = `
        SELECT COUNT(*) AS count 
        FROM learner 
        WHERE Status = 'Waiting List'
    `;

	// Execute all queries
	connection.query(monthlyQuery, (err, monthlyResults) => {
		if (err) throw err;

		const monthlyLabels = monthlyResults.map((row) => `Month ${row.period}`);
		const monthlyData = monthlyResults.map((row) => row.count);

		connection.query(weeklyQuery, (err, weeklyResults) => {
			if (err) throw err;

			const weeklyLabels = weeklyResults.map((row) => `Week ${row.period}`);
			const weeklyData = weeklyResults.map((row) => row.count);

			connection.query(dailyQuery, (err, dailyResults) => {
				if (err) throw err;

				const dailyLabels = dailyResults.map((row) => `Day ${row.period}`);
				const dailyData = dailyResults.map((row) => row.count);

				const allLabels = [
					...new Set([...monthlyLabels, ...weeklyLabels, ...dailyLabels]),
				];

				const mergedMonthlyData = allLabels.map((label) => {
					const index = monthlyLabels.indexOf(label);
					return index !== -1 ? monthlyData[index] : 0;
				});

				const mergedWeeklyData = allLabels.map((label) => {
					const index = weeklyLabels.indexOf(label);
					return index !== -1 ? weeklyData[index] : 0;
				});

				const mergedDailyData = allLabels.map((label) => {
					const index = dailyLabels.indexOf(label);
					return index !== -1 ? dailyData[index] : 0;
				});

				// Execute queries for accepted and waiting list counts
				connection.query(acceptedQuery, (err, acceptedResults) => {
					if (err) throw err;

					const acceptedCount = acceptedResults[0].count;

					connection.query(waitingListQuery, (err, waitingListResults) => {
						if (err) throw err;

						const waitingListCount = waitingListResults[0].count;

						// Fetch all learners data for the table
						const learnersQuery = "SELECT * FROM learner";
						connection.query(learnersQuery, (err, learners) => {
							if (err) throw err;

							// Render dashboard with all data
							res.render("dashboard", {
								learners: learners,
								labels: JSON.stringify(allLabels),
								monthlyData: JSON.stringify(mergedMonthlyData),
								weeklyData: JSON.stringify(mergedWeeklyData),
								dailyData: JSON.stringify(mergedDailyData),
								acceptedCount: JSON.stringify(acceptedCount),
								waitingListCount: JSON.stringify(waitingListCount),
							});
						});
					});
				});
			});
		});
	});
});

// Search in Dashboard
app.post("/admin/dashboard/search", (req, res) => {
	if (!req.session.admin) {
		return res.redirect("/admin/login");
	}
	const searchTerm = req.body.searchTerm;
	const query = `
    SELECT * FROM learner
    WHERE Name_Surname LIKE ? OR CellPhoneNumber LIKE ?
  `;
	const searchPattern = `%${searchTerm}%`;
	connection.query(query, [searchPattern, searchPattern], (err, results) => {
		if (err) throw err;
		res.render("dashboard", { learners: results });
	});
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

// Admin Actions
app.post("/admin/action", (req, res) => {
	const learnerID = req.body.learnerID;
	const action = req.body.action;

	let query, status;
	if (action === "accept") {
		status = "Approved";
	} else if (action === "waitlist") {
		status = "Waiting List";
	} else if (action === "delete") {
		query = "DELETE FROM learner WHERE LearnerID = ?";
		connection.query(query, [learnerID], (err, result) => {
			if (err) throw err;
			res.redirect("/admin/dashboard");
		});
		return; // Exit the function after handling deletion
	}

	if (status) {
		query = "UPDATE learner SET Status = ? WHERE LearnerID = ?";
		connection.query(query, [status, learnerID], (err, result) => {
			if (err) throw err;
			res.redirect("/admin/dashboard");
		});
	}
});

// Format date using Moment.js
function formatDate(date) {
	return moment(date).format("DD MMM YYYY"); 
}

// Define the generateDailyReport function
function generateDailyReport(callback) {
	// Query for learners on the waiting list
	const waitingListQuery = `
    SELECT * FROM learner
    WHERE Status = 'Waiting List'
    AND DATE(RegistrationDate) = CURDATE()
  `;

	// Query for learners using the bus transport on a specific day
	const busUsageQuery = `
        SELECT l.*, 
           b.BusNumber, 
           b.BusCapacity,
           r.RouteName, 
           p.Location AS PickupLocation, 
           p.PickupTime, 
           d.Location AS DropoffLocation, 
           d.DropoffTime,
		   CASE 
               WHEN p.PickupTime IS NOT NULL THEN 'Yes' 
               ELSE 'No' 
           END AS morning_use, 
           CASE 
               WHEN d.DropoffTime IS NOT NULL THEN 'Yes' 
               ELSE 'No' 
           END AS afternoon_use
    FROM busregistration br
    JOIN learner l ON br.LearnerID = l.LearnerID
    JOIN busroute r ON br.RouteID = r.RouteID
    JOIN pickuppoint p ON br.PickupID = p.PickupID
    JOIN dropoffpoint d ON br.DropoffID = d.DropoffID
    JOIN bus b ON b.RouteID = br.RouteID
    WHERE l.Status = "Approved"
	AND DATE(br.RegistrationDate) = CURDATE()
  `;
	// Execute the queries in parallel
	connection.query(waitingListQuery, (err, waitingListResults) => {
		if (err) throw err;

		connection.query(busUsageQuery, (err, busUsageResults) => {
			if (err) throw err;

			// Combine the results
			const report = {
				waitingList: waitingListResults,
				busUsage: busUsageResults,
			};

			callback(report);
		});
	});
}

 // Define the generateWeeklyReport function
function generateWeeklyReport(callback) {
	const query = `
        SELECT l.*, 
           b.BusNumber, 
           b.BusCapacity,
           r.RouteName, 
           p.Location AS PickupLocation, 
           p.PickupTime, 
           d.Location AS DropoffLocation, 
           d.DropoffTime,
		   CASE 
               WHEN p.PickupTime IS NOT NULL THEN 'Yes' 
               ELSE 'No' 
           END AS morning_use, 
           CASE 
               WHEN d.DropoffTime IS NOT NULL THEN 'Yes' 
               ELSE 'No' 
           END AS afternoon_use
    FROM busregistration br
    JOIN learner l ON br.LearnerID = l.LearnerID
    JOIN busroute r ON br.RouteID = r.RouteID
    JOIN pickuppoint p ON br.PickupID = p.PickupID
    JOIN dropoffpoint d ON br.DropoffID = d.DropoffID
    JOIN bus b ON b.RouteID = br.RouteID
    WHERE l.Status = "Approved" 
    AND YEARWEEK(br.RegistrationDate, 1) = YEARWEEK(CURDATE(), 1)
  `;
	connection.query(query, (err, results) => {
		if (err) {
			console.error("Error executing query:", err);
			throw err;
		}
		callback(results);
	});
}

// Define the generateMonthlyReport function
function generateMonthlyReport(callback) {
	const query = `
       SELECT l.*, 
           b.BusNumber, 
           b.BusCapacity,
           r.RouteName, 
           p.Location AS PickupLocation, 
           p.PickupTime, 
           d.Location AS DropoffLocation, 
           d.DropoffTime,
		   CASE 
               WHEN p.PickupTime IS NOT NULL THEN 'Yes' 
               ELSE 'No' 
           END AS morning_use, 
           CASE 
               WHEN d.DropoffTime IS NOT NULL THEN 'Yes' 
               ELSE 'No' 
           END AS afternoon_use
    FROM busregistration br
    JOIN learner l ON br.LearnerID = l.LearnerID
    JOIN busroute r ON br.RouteID = r.RouteID
    JOIN pickuppoint p ON br.PickupID = p.PickupID
    JOIN dropoffpoint d ON br.DropoffID = d.DropoffID
    JOIN bus b ON b.RouteID = br.RouteID
    WHERE l.Status = "Approved" 
    AND MONTH(br.RegistrationDate) = MONTH(CURDATE()) 
    AND YEAR(br.RegistrationDate) = YEAR(CURDATE())`;

	connection.query(query, (err, results) => {
		if (err) {
			console.error("Error executing query:", err);
			throw err;
		}
		callback(results);
	});
}

 // MIS Report Routes
app.post("/generate-reports/daily", (req, res) => {
	generateDailyReport((results) => {
		const { waitingList, busUsage } = results;
		res.render("dailyReport", { waitingList, busUsage });
	});
});

app.post("/generate-reports/weekly", (req, res) => {
	generateWeeklyReport((results) =>
		res.render("weeklyReport", { busUsage: results })
	);
});

app.post("/generate-reports/monthly", (req, res) => {
	generateMonthlyReport((results) =>
		res.render("monthlyReport", { busUsage: results })
	);
});

// Search Routes for MIS Reports
app.post("/search-reports/daily", (req, res) => {
	const searchTerm = req.body.searchTerm;
	const query = `
    SELECT * FROM learner
    WHERE Status = "Waiting List" AND DATE(RegistrationDate) = CURDATE()
    AND (Name_Surname LIKE ? OR CellPhoneNumber LIKE ?)
  `;
	const searchPattern = `%${searchTerm}%`;
	connection.query(query, [searchPattern, searchPattern], (err, results) => {
		if (err) throw err;
		res.render("dailyReport", { waitingList, busUsage });
	});
});

app.post("/search-reports/weekly", (req, res) => {
	const searchTerm = req.body.searchTerm;
	const query = `
    SELECT * FROM learner
    WHERE Status = "Waiting List" AND YEARWEEK(RegistrationDate, 1) = YEARWEEK(CURDATE(), 1)
    AND (Name_Surname LIKE ? OR CellPhoneNumber LIKE ?)
  `;
	const searchPattern = `%${searchTerm}%`;
	connection.query(query, [searchPattern, searchPattern], (err, results) => {
		if (err) throw err;
		res.render("weeklyReport", { learners: results });
	});
});

app.post("/search-reports/monthly", (req, res) => {
	const searchTerm = req.body.searchTerm;
	const query = `
    SELECT * FROM learner
    WHERE Status = "Waiting List" AND MONTH(RegistrationDate) = MONTH(CURDATE())
    AND YEAR(RegistrationDate) = YEAR(CURDATE())
    AND (Name_Surname LIKE ? OR CellPhoneNumber LIKE ?)
  `;
	const searchPattern = `%${searchTerm}%`;
	connection.query(query, [searchPattern, searchPattern], (err, results) => {
		if (err) throw err;
		res.render("monthlyReport", { learners: results });
	});
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});
