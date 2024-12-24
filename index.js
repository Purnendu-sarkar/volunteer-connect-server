const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const { MongoClient, ServerApiVersion } = require('mongodb');

const port = process.env.PORT || 5000;

//Middleware
app.use(cors());
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ygp3m.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const databasesList = await client.db('volunteerNetwork');
    const collectionsList = await databasesList.collection('volunteerList');

    // Define an endpoint to handle adding a new volunteer post to the database
    app.post("/addPost", async (req, res) => {
      const post = req.body;
      const result = await collectionsList.insertOne(post);
      res.send(result);
    });


    // Fetch all posts with optional search query
    app.get("/volunteerPosts", async (req, res) => {
      const { title } = req.query;
      const query = title ? { title: { $regex: title, $options: "i" } } : {};
      const posts = await collectionsList.find(query).toArray();
      res.send(posts);
    });



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('Volunteer Network Server is Running')
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
})

