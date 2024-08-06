require("dotenv").config();
const express = require("express");
const multer = require("multer");
const sqlite3 = require("sqlite3").verbose();
const upload = multer({ dest: "uploads/" });
const uploadBlog = multer({ dest: "uploads_blog/" });
const path = require("path");
const fs = require("fs");
const cookieParser = require("cookie-parser");
const favicon = require("serve-favicon");

const app = express();

app.use(favicon(path.join(__dirname, "public", "favicon.ico")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/uploads_blog", express.static(path.join(__dirname, "uploads_blog")));
app.use("/tinymce", express.static(path.join(__dirname, "tinymce")));
app.use(express.static(path.join(__dirname, "public")));

app.use(cookieParser());
app.locals.title = "TGE CMS";

// Create and connect to the SQLite database
const db = new sqlite3.Database("data.db", async (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to the database.");

    // Create the table if it doesn't exist
    await db.run(`
      CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY,
        title TEXT,
        description TEXT,
        image TEXT,
        link TEXT
      )
    `);
    console.log("records checked");

    // Create or modify the blog_posts table
    await db.run(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id INTEGER PRIMARY KEY,
        slug TEXT,
        title TEXT,
        preview TEXT,
        content TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("blog_posts checked");

    // Check and add new columns if they don't exist
    const addColumnIfNotExists = async (table, column, columnDef) => {
      db.all(`PRAGMA table_info(${table})`, (err, info) => {
        if (err) {
          console.error(`Error getting table info for ${table}:`, err.message);
        } else {
          const columns = info.map((col) => col.name);
          if (!columns.includes(column)) {
            db.run(
              `ALTER TABLE ${table} ADD COLUMN ${column} ${columnDef}`,
              (err) => {
                if (err)
                  console.error(
                    `Error adding column ${column} to ${table}:`,
                    err.message
                  );
              }
            );
          }
        }
      });
    };

    await addColumnIfNotExists("blog_posts", "slug", "TEXT");
    await addColumnIfNotExists("blog_posts", "title", "TEXT");
    await addColumnIfNotExists("blog_posts", "preview", "TEXT");
  }
});

// Simple authentication middleware
const authenticate = (req, res, next) => {
  const { password } = req.body;

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

const githubDispatch = async (req, res, next) => {
  try {
    const owner = "threegoeseasy";
    const repo = "threegoeseasy-astro";
    const token = process.env.GITHUB_TOKEN; // Store this securely, e.g., in environment variables

    const url = `https://api.github.com/repos/${owner}/${repo}/dispatches`;
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `token ${token}`,
    };
    const body = JSON.stringify({
      event_type: "webhook",
    });

    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: body,
    });

    if (!response.ok) {
      throw new Error(`GitHub dispatch failed: ${response.statusText}`);
    }

    console.log("GitHub dispatch triggered successfully.");
    next();
  } catch (error) {
    res.status(500).send("Error triggering GitHub dispatch", { error });
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

//DELETE
app.delete(
  "/delete",
  express.urlencoded({ extended: true }),
  checkAuthentication,
  (req, res) => {
    const { title } = req.body;
    const deleteSql = "DELETE FROM records WHERE title = ?";
    db.run(deleteSql, [title], (err, row) => {
      if (err) {
        console.error("Error checking record:", err.message);
        res.status(500).send("Error checking record");
      } else {
        console.log(`Record with title "${title}" deleted.`);
        res.send("Record deleted successfully!");
      }
    });
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

// Upload blog post
app.post(
  "/savePost",
  checkAuthentication,
  uploadBlog.none(),
  async (req, res, next) => {
    try {
      // Extract the content from the TinyMCE editor and other fields
      const { slug, title, preview, content } = req.body; // Adjust this based on how TinyMCE sends the data

      // Insert the content into the database
      await db.run(
        `INSERT INTO blog_posts (slug, title, preview, content) VALUES (?, ?, ?, ?)`,
        [slug, title, preview, content]
      );

      console.log("Post saved successfully.");
      next(); // Proceed to the next middleware (githubDispatch)
    } catch (error) {
      console.error("Error saving blog post:", error);
      res.status(500).send("Error saving blog post");
    }
  },
  githubDispatch, // Add the middleware here
  (req, res) => {
    // Send a temporary redirect to success page after 2 seconds with meta refresh
    res.setHeader("Refresh", "2; URL=/"); // Replace with your desired URL
    res.send("<h1 style='color: green'>Record inserted successfully!</h1>");
  }
);

// Edit blog post
app.post(
  "/editPost/:id",
  checkAuthentication,
  uploadBlog.none(),
  async (req, res, next) => {
    try {
      // Extract the content and other fields from the TinyMCE editor
      const { slug, title, preview, content } = req.body;
      const { id } = req.params;

      // Update the content in the database
      await db.run(
        `UPDATE blog_posts SET slug = ?, title = ?, preview = ?, content = ? WHERE id = ?`,
        [slug, title, preview, content, id]
      );

      console.log("Post updated successfully.");
      next(); // Proceed to the next middleware (if any)
    } catch (error) {
      console.error("Error updating blog post:", error);
      res.status(500).send("Error updating blog post");
    }
  },
  githubDispatch, // Add the middleware here if necessary
  (req, res) => {
    // Send a temporary redirect to success page after 2 seconds with meta refresh
    res.setHeader("Refresh", "2; URL=/"); // Replace with your desired URL
    res.send("<h1 style='color: green'>Record updated successfully!</h1>");
  }
);

// Endpoint for deleting a post by ID
app.delete(
  "/deletePost/:id",
  express.urlencoded({ extended: true }),
  checkAuthentication,
  (req, res, next) => {
    const postId = req.params.id;

    db.run("DELETE FROM blog_posts WHERE id = ?", [postId], (err) => {
      if (err) {
        console.error("Error deleting post:", err.message);
        return res.status(500).send("Error deleting post");
      } else {
        console.log(`Post with ID ${postId} deleted.`);
      }
    });
    next(); // Proceed to the next middleware (githubDispatch)
  },
  githubDispatch,
  (req, res) => {
    // Send a temporary redirect to success page after 2 seconds with meta refresh
    res.setHeader("Refresh", "2; URL=/"); // Replace with your desired URL
    res.send("<h1 style='color: red'>Record deleted successfully!</h1>");
  }
);

// Handle form submission
app.post(
  "/saveImage",
  checkAuthentication,
  uploadBlog.single("file"),
  (req, res) => {
    const imageFile = req.file;
    let image = null;
    if (imageFile) {
      // Generate a new unique filename for the uploaded image
      const uniqueFilename = `${Date.now()}-${imageFile.originalname}`;
      const imagePath = path.join(__dirname, "uploads_blog", uniqueFilename);

      // Move the uploaded file to the specified path with the new filename
      fs.rename(imageFile.path, imagePath, (err) => {
        if (err) {
          console.error("Error moving file:", err);
          return res.status(500).json({ error: "Failed to save image" });
        }

        image = uniqueFilename;
        //  console.log(imageFile.path, imagePath, image);
        res.json({ location: image }); // Return only the filename
      });
    } else {
      res.status(400).json({ error: "No file uploaded" });
    }
  }
);

app.get("/getPost/:id", async (req, res) => {
  const postId = req.params.id;
  db.get("SELECT * FROM blog_posts WHERE id = ?", [postId], (err, row) => {
    if (err) {
      console.error("Error fetching post:", err);
      res.status(500).send("Error fetching post");
    } else {
      res.json(row);
    }
  });
});

// Endpoint to get all records
app.get("/getAllPosts", (req, res) => {
  const sql = "SELECT * FROM blog_posts";
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("Error retrieving records:", err.message);
      res.status(500).send("Error retrieving records");
    } else {
      res.json(rows);
    }
  });
});

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
  const query = "SELECT image FROM records"; // Replace 'image' with the column name

  db.all(query, (err, rows) => {
    if (err) {
      console.error("Error executing query:", err);
      callback(err, null);
    } else {
      // Extract filenames from the query result and return them as an array
      const filenames = rows.map((row) => row.image);
      callback(null, filenames);
    }
  });
};

// Function to check and clean up unnecessary files in the uploads folder
cleanupUploadsFolder = () => {
  fs.readdir("uploads", (err, files) => {
    if (err) {
      console.error("Error reading the uploads folder:", err);
      return;
    }

    fetchFilenamesFromDatabase((err, dbFilenames) => {
      if (err) {
        console.error("Error fetching filenames from the database:", err);
        return;
      }

      files.forEach((filename) => {
        if (!dbFilenames.includes(filename)) {
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
const [PORT, HOST] = [process.env.APP_PORT, process.env.APP_IP];
app.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
});
