const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const mysql = require("mysql2");
const dotenv = require("dotenv");
const morgan = require("morgan");
const { log } = require("console");
const moment = require("moment");
const nodemailer = require("nodemailer");

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
			// Pass errorMessage to EJS template if credentials are incorrect
			res.render("parentLogin", {
				errorMessage: "Incorrect email or password.",
			});
		}
	});
});

// Function to send acknowledgment email for approved applications
const sendApprovedEmail = (parentEmail, learnerName) => {
	const transporter = nodemailer.createTransport({
		host: "smtp-relay.sendinblue.com",
		port: 587,
		auth: {
			user: process.env.SENDINBLUE_USER,
			pass: process.env.SENDINBLUE_PASSWORD,
		},
	});

	const mailOptions = {
		from: '"Strive High Secondary School" princessmakgotso@gmail.com',
		to: parentEmail,
		subject: "Learner Application Approved",
		text: `Dear Parent, \n\nCongratulations! The application for ${learnerName} has been approved. Please proceed with the next steps on our platform.\n\nBest regards,\nSchool Name`,
		html: `<p>Dear Parent,</p><p>Congratulations! The application for <strong>${learnerName}</strong> has been approved. Please proceed with the next steps on our platform.</p><p>Best regards,<br>Strive High Secondary School</p>`,
	};

	transporter.sendMail(mailOptions, (err, info) => {
		if (err) {
			console.error("Error sending approved email:", err);
		} else {
			console.log("Approval email sent:", info.response);
		}
	});
};

// Function to send email if the learner is on the waiting list
const sendWaitingListEmail = (parentEmail, learnerName) => {
	const transporter = nodemailer.createTransport({
		host: "smtp-relay.sendinblue.com",
		port: 587,
		auth: {
			user: process.env.SENDINBLUE_USER,
			pass: process.env.SENDINBLUE_PASSWORD,
		},
	});

	const mailOptions = {
		from: '"Strive High Secondary School" princessmakgotso@gmail.com',
		to: parentEmail,
		subject: "Learner Application on Waiting List",
		text: `Dear Parent, \n\nWe have received the application for ${learnerName}. Currently, it is placed on the waiting list. We will notify you once the status changes.\n\nBest regards,\nSchool Name`,
		html: `<p>Dear Parent,</p><p>We have received the application for <strong>${learnerName}</strong>. Currently, it is placed on the waiting list. We will notify you once the status changes.</p><p>Best regards,<br>Strive High Secondary School</p>`,
	};

	transporter.sendMail(mailOptions, (err, info) => {
		if (err) {
			console.error("Error sending waiting list email:", err);
		} else {
			console.log("Waiting list email sent:", info.response);
		}
	});
};

app.get("/learner/signup", (req, res) => {
	res.render("learnerSignup");
});

// Learner actions
app.post("/learner/signup", (req, res) => {
	if (!req.session || !req.session.parent) return res.redirect("/parent/login");

	const {
		name_surname,
		cellPhoneNumber,
		grade,
		busRoute,
		morningLocation,
		afternoonLocation,
		registration_date,
	} = req.body;

	const parentId = req.session.parent.ParentID;
	const parentEmail = req.session.parent.Email;

	// Check if all required fields are filled
	if (
		!name_surname ||
		!cellPhoneNumber ||
		!registration_date ||
		!grade ||
		!busRoute ||
		!morningLocation ||
		!afternoonLocation ||
		!parentId
	) {
		return res.redirect("/learner/signup?status=error");
	}

	// Step 1: Check bus capacity
	const checkBusCapacityQuery = "SELECT BusCapacity FROM bus WHERE RouteID = ?";
	connection.query(checkBusCapacityQuery, [busRoute], (err, busResults) => {
		if (err || busResults.length === 0) {
			console.error("Error checking bus capacity:", err);
			return res.redirect("/learner/signup?status=error");
		}

		const busCapacity = busResults[0].BusCapacity;
		const learnerStatus = busCapacity > 0 ? "Approved" : "Waiting List";

		// Step 2: Insert learner into the database
		const insertLearnerQuery = `
            INSERT INTO learner (Name_Surname, CellPhoneNumber, Grade, RegistrationDate, ParentID, Status) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
		connection.query(
			insertLearnerQuery,
			[
				name_surname,
				cellPhoneNumber,
				grade,
				registration_date,
				parentId,
				learnerStatus,
			],
			(err, results) => {
				if (err) {
					console.error("Error inserting learner:", err);
					return res.redirect("/learner/signup?status=error");
				}

				const learnerId = results.insertId;

				// Step 3: Send acknowledgment email
				if (learnerStatus === "Approved") {
					sendApprovedEmail(parentEmail, name_surname);
				} else {
					sendWaitingListEmail(parentEmail, name_surname);
				}

				// Step 4: Update bus capacity and register the bus if approved
				if (learnerStatus === "Approved") {
					const updateBusCapacityQuery = `
                        UPDATE bus SET BusCapacity = BusCapacity - 1 
                        WHERE RouteID = ? AND BusCapacity > 0
                    `;
					connection.query(updateBusCapacityQuery, [busRoute], (err) => {
						if (err) {
							console.error("Error updating bus capacity:", err);
							return res.redirect("/learner/signup?status=error");
						}

						// Insert into busregistration table
						const insertBusRegistrationQuery = `
                            INSERT INTO busregistration (LearnerID, RouteID, PickupID, DropoffID) 
                            VALUES (?, ?, ?, ?)
                        `;
						connection.query(
							insertBusRegistrationQuery,
							[learnerId, busRoute, morningLocation, afternoonLocation],
							(err) => {
								if (err) {
									console.error("Error registering bus:", err);
									return res.redirect("/learner/signup?status=error");
								}
								return res.redirect(
									`/learner/${learnerId}/details?status=success`
								);
							}
						);
					});
				} else {
					// If not approved, redirect to the details page
					return res.redirect(`/learner/${learnerId}/details?status=success`);
				}
			}
		);
	});
});

// Learner details route
app.get("/learner/:id/details", (req, res) => {
	const learnerId = req.params.id;

	// Query to get learner's status
	const learnerQuery =
		"SELECT Name_Surname, Grade, Status FROM learner WHERE LearnerID = ?";
	connection.query(learnerQuery, [learnerId], (err, learnerResults) => {
		if (err || learnerResults.length === 0) {
			console.error("Error fetching learner status:", err);
			return res.status(404).send("Learner not found.");
		}

		const learner = learnerResults[0];

		// Query to get bus and pickup/dropoff details
		const detailsQuery = `
            SELECT 
                bus.BusNumber,
                pickuppoint.PickupTime,
                pickuppoint.PickUpNumber,
                dropoffpoint.DropoffTime,
                dropoffpoint.DropOffNumber
            FROM busregistration
            LEFT JOIN bus ON bus.RouteID = busregistration.RouteID
            LEFT JOIN pickuppoint ON pickuppoint.PickupID = busregistration.PickupID
            LEFT JOIN dropoffpoint ON dropoffpoint.DropoffID = busregistration.DropoffID
            WHERE busregistration.LearnerID = ?`;

		connection.query(detailsQuery, [learnerId], (err, detailsResults) => {
			if (err) {
				console.error("Error fetching learner details:", err);
				return res.status(500).send("Internal server error.");
			}

			// Check if bus registration details are found
			const details = detailsResults.length > 0 ? detailsResults[0] : null;

			// Render the EJS template with the fetched data
			res.render("learnerDashboard", {
				learner,
				pickup: details
					? {
							PickupTime: details.PickupTime,
							PickUpNumber: details.PickUpNumber,
					  }
					: null,
				dropoff: details
					? {
							DropoffTime: details.DropoffTime,
							DropOffNumber: details.DropOffNumber,
					  }
					: null,
				bus: details ? { BusNumber: details.BusNumber } : null,
			});
		});
	});
});

app.get("/AlllearnersDashboard", (req, res) => {
	if (!req.session || !req.session.parent) return res.redirect("/parent/login");

	const parentId = req.session.parent.ParentID;
	const query = `
		SELECT learner.LearnerID, learner.Name_Surname, learner.Grade, learner.Status, 
		       pickuppoint.PickupTime, pickuppoint.PickUpNumber, bus.BusNumber, 
		       dropoffpoint.DropoffTime, dropoffpoint.DropOffNumber
		FROM learner
		LEFT JOIN busregistration ON learner.LearnerID = busregistration.LearnerID
		LEFT JOIN bus ON busregistration.RouteID = bus.RouteID
		LEFT JOIN pickuppoint ON busregistration.PickupID = pickuppoint.PickupID
		LEFT JOIN dropoffpoint ON busregistration.DropoffID = dropoffpoint.DropoffID
		WHERE learner.ParentID = ?`;

	connection.query(query, [parentId], (err, results) => {
		if (err) {
			console.error("Error fetching learners:", err);
			return res.send("Error fetching learners.");
		}

		res.render("AllLearnersDashboard", { learners: results });
	});
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
		// dummy data
		const monthlyData = JSON.stringify([10, 15, 20]);
		const weeklyData = JSON.stringify([5, 7, 9]);
		const dailyData = JSON.stringify([1, 2, 3]);
		res.render("dashboard", {
			learners: results,
			monthlyData: monthlyData,
			weeklyData: weeklyData,
			dailyData: dailyData,
		});
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
			// Pass errorMessage to EJS template if credentials are incorrect
			res.render("adminLogin", {
				errorMessage: "Login credentials are incorrect",
			});
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
		// Delete bus registrations related to the learner
		query = "DELETE FROM busregistration WHERE LearnerID = ?";
		connection.query(query, [learnerID], (err) => {
			if (err) {
				console.error("Error deleting bus registrations:", err);
				return res.status(500).send("Error deleting bus registrations.");
			}

			// Delete the learner after successful bus registration deletion
			query = "DELETE FROM learner WHERE LearnerID = ?";
			connection.query(query, [learnerID], (err, result) => {
				if (err) {
					console.error("Error deleting learner:", err);
					return res.status(500).send("Error deleting learner.");
				}
				res.redirect("/admin/dashboard");
			});
		});
		return;
	}

	// If status needs to be updated (Approve or Waitlist)
	if (status) {
		query = "UPDATE learner SET Status = ? WHERE LearnerID = ?";
		connection.query(query, [status, learnerID], (err, result) => {
			if (err) {
				console.error("Error updating learner status:", err);
				return res.status(500).send("Error updating learner status.");
			}
			res.redirect("/admin/dashboard");
		});
	}
});

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
		// dummy data
		const monthlyData = JSON.stringify([10, 15, 20]);
		const weeklyData = JSON.stringify([5, 7, 9]);
		const dailyData = JSON.stringify([1, 2, 3]);
		res.render("dashboard", {
			learners: results,
			monthlyData: monthlyData,
			weeklyData: weeklyData,
			dailyData: dailyData,
		});
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
		// dummy data
		const monthlyData = JSON.stringify([10, 15, 20]);
		const weeklyData = JSON.stringify([5, 7, 9]);
		const dailyData = JSON.stringify([1, 2, 3]);
		res.render("dashboard", {
			learners: results,
			monthlyData: monthlyData,
			weeklyData: weeklyData,
			dailyData: dailyData,
		});
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
		// dummy data
		const monthlyData = JSON.stringify([10, 15, 20]);
		const weeklyData = JSON.stringify([5, 7, 9]);
		const dailyData = JSON.stringify([1, 2, 3]);
		res.render("dashboard", {
			learners: results,
			monthlyData: monthlyData,
			weeklyData: weeklyData,
			dailyData: dailyData,
		});
	});
});

// Cancel application
app.post("/learner/delete/:id", (req, res) => {
	const learnerId = req.params.id;
	console.log("Deleting learner with ID:", learnerId);

	if (!learnerId) {
		return res.status(400).send("Learner ID is missing.");
	}

	const redirectTarget = req.body.redirect || req.query.redirect;

	// First, delete associated bus registrations
	const deleteBusRegistrationQuery =
		"DELETE FROM busregistration WHERE LearnerID = ?";
	connection.query(deleteBusRegistrationQuery, [learnerId], (err) => {
		if (err) {
			console.error("Error deleting bus registrations:", err);
			return res.status(500).send("Error deleting bus registrations.");
		}

		// SQL query to delete the learner
		const deleteQuery = "DELETE FROM learner WHERE LearnerID = ?";
		connection.query(deleteQuery, [learnerId], (err, result) => {
			if (err) {
				console.error("Error deleting learner:", err);
				return res.status(500).send("Error deleting learner.");
			}

			// Redirect based on the redirect parameter
			if (redirectTarget === "all") {
				res.redirect("/AllLearnersDashboard");
			} else if (redirectTarget === "details") {
				res.redirect("/learnerDashboard");
			} else {
				res.redirect("/dashboard");
			}
		});
	});
});

app.get("/logout", (req, res) => {
	req.session.destroy((err) => {
		if (err) {
			console.error("Error logging out:", err);
			return res.send("Error logging out.");
		}
		res.redirect("/");
	});
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});
