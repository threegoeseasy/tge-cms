const express = require("express");
const multer = require("multer");
const sqlite3 = require("sqlite3").verbose();
const app = express();
const upload = multer({ dest: "uploads/" });
const path = require("path");
const fs = require("fs");
const cookieParser = require("cookie-parser");
const favicon = require("serve-favicon");

// Use cookie parser middleware
app.use(cookieParser());
app.use(favicon(path.join(__dirname, "public", "favicon.ico")));
app.locals.title = "TGE CMS";
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Create and connect to the SQLite database
const db = new sqlite3.Database("data.db", (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to the database.");
    // Create the table if it doesn't exist
    db.run(`
      CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY,
        title TEXT,
        description TEXT,
        image TEXT,
        link TEXT
      )
    `);
  }
});

// Simple authentication middleware
const authenticate = (req, res, next) => {
  const { password } = req.body;

  // Replace these hardcoded values with your actual username and password
  const validPassword = process.env.USER_PASSWORD;

  if (password === validPassword) {
    // Authentication successful, proceed to the next middleware or route handler
    res.cookie("user", "godmode", { httpOnly: true });

    next();
  } else {
    // Authentication failed, return unauthorized status
    res.status(401).send("Unauthorized");
  }
};

// Authentication check middleware for the main form
const checkAuthentication = (req, res, next) => {
  const isAuthenticated = req.cookies.user === "godmode";

  if (isAuthenticated) {
    // User is authenticated, proceed to the next middleware or route handler
    next();
  } else {
    // User is not authenticated, redirect to the login page
    res.redirect("/login");
  }
};

// Serve the HTML login form
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

// Handle login form submission
app.post(
  "/login",
  express.urlencoded({ extended: true }),
  authenticate,
  (req, res) => {
    // Authentication successful, redirect to the main form
    res.redirect("/");
  }
);

// Serve the main HTML form with authentication check
app.get("/", checkAuthentication, (req, res) => {
  res.sendFile(path.join(__dirname, "form.html"));
});

// Handle form submission
app.post(
  "/saveRecord",
  checkAuthentication,
  upload.single("image"),
  (req, res) => {
    const title = req.body.title;
    const description = req.body.description;
    const imageFile = req.file;
    const link = req.body.link;

    let image = null;
    if (imageFile) {
      // Generate a new unique filename for the uploaded image
      const uniqueFilename = `${Date.now()}-${imageFile.originalname}`;
      const imagePath = path.join(__dirname, "uploads", uniqueFilename);

      // Move the uploaded file to the specified path with the new filename
      fs.renameSync(imageFile.path, imagePath);

      image = uniqueFilename;
    }

    // Check if the record with the given title exists in the database
    const checkSql = "SELECT * FROM records WHERE title = ?";
    db.get(checkSql, [title], (err, row) => {
      if (err) {
        console.error("Error checking record:", err.message);
        res.status(500).send("Error checking record");
      } else if (row) {
        // If the record exists, update it
        const updateSql =
          "UPDATE records SET description = ?, image = ?, link = ? WHERE title = ?";
        db.run(updateSql, [description, image, link, title], function (err) {
          if (err) {
            console.error("Error updating record:", err.message);
            res.status(500).send("Error updating record");
          } else {
            console.log(`Record with title "${title}" updated.`);
            res.send("Record updated successfully!");
          }
        });
      } else {
        // If the record doesn't exist, create a new one
        const insertSql =
          "INSERT INTO records (title, description, image, link) VALUES (?, ?, ?, ?)";
        db.run(insertSql, [title, description, image, link], function (err) {
          if (err) {
            console.error("Error inserting record:", err.message);
            res.status(500).send("Error inserting record");
          } else {
            console.log(`Record with title "${title}" inserted.`);
            res.send("Record inserted successfully!");
          }
        });
      }
    });
  }
);

// Endpoint to get all records
app.get("/getAllRecords", (req, res) => {
  const sql = "SELECT * FROM records";
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("Error retrieving records:", err.message);
      res.status(500).send("Error retrieving records");
    } else {
      res.json(rows);
    }
  });
});

// Function to fetch filenames from the database
const fetchFilenamesFromDatabase = (callback) => {
  const query = "SELECT image FROM records"; // Replace 'image' with the column name where you store filenames

  db.all(query, (err, rows) => {
    if (err) {
      console.error("Error executing query:", err);
      callback(err, null);
    } else {
      // Extract the filenames from the query result and return them as an array
      const filenames = rows.map((row) => row.image);
      callback(null, filenames);
    }
  });
};

// Function to check and clean up unnecessary files in the uploads folder
const cleanupUploadsFolder = () => {
  fs.readdir("uploads", (err, files) => {
    if (err) {
      console.error("Error reading the uploads folder:", err);
      return;
    }

    // Fetch the filenames from the database (you need to implement this function)
    // Assuming you have a function fetchFilenamesFromDatabase() to get filenames from the database
    fetchFilenamesFromDatabase((err, dbFilenames) => {
      if (err) {
        console.error("Error fetching filenames from the database:", err);
        return;
      }

      // Check each file in the uploads folder
      files.forEach((filename) => {
        // Check if the filename is not present in the database
        if (!dbFilenames.includes(filename)) {
          // If not present, remove the file from the uploads folder
          const filePath = path.join("uploads", filename);
          fs.unlink(filePath, (err) => {
            if (err) {
              console.error("Error deleting file:", filePath, err);
            } else {
              console.log("Deleted file:", filePath);
            }
          });
        }
      });
    });
  });
};

// Call the cleanupUploadsFolder method at a suitable interval
// For example, you can call it once a day or once an hour depending on your needs
// For demonstration purposes, we'll call it every 24 hours (86400000 milliseconds).
setInterval(cleanupUploadsFolder, 86400000);

// Route to trigger the cleanupUploadsFolder function manually
app.get("/cleanup", (req, res) => {
  cleanupUploadsFolder();
  res.send("Uploads folder cleanup executed.");
});

// Start the server
const PORT = 3333;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
