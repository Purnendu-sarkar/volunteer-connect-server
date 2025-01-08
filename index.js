const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken')
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 5000;
const cookieParser = require('cookie-parser');
const corsOptions = {
  origin: ['http://localhost:5173', 'https://volunteer-connect-d5524.web.app', 'https://volunteer-connect-d5524.firebaseapp.com'],
  credentials: true,
  optionalSuccessStatus: 200,
}

//Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ygp3m.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// verifyToken
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token || req.query?.token;
  console.log(req.cookies);
  if (!token) return res.status(401).send({ message: 'Unauthorized access, token missing' })
  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'Forbidden, invalid token' })
    }
    req.decoded = decoded;
    next();
  })

  
}

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    // Establish and verify connection
    const volunteerNetworkDb = client.db('volunteerNetwork');
    const volunteerListCollection = volunteerNetworkDb.collection('volunteerList');
    const volunteerRequestsCollection = volunteerNetworkDb.collection('requests');


     // generate jwt
     app.post('/jwt', async (req, res) => {
      const email = req.body;
      // create token
      const token = jwt.sign(email, process.env.SECRET_KEY, {
        expiresIn: '365d',
      })
      console.log(token)
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true, token})
    })

     // logout || clear cookie from browser
     app.get('/logout', async (req, res) => {
      res
        .clearCookie('token', {
          maxAge: 0,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })

    // Define an endpoint to handle adding a new volunteer post to the database
    app.post("/addPost", async (req, res) => {
      const post = req.body;
      const result = await volunteerListCollection.insertOne(post);
      res.send(result);
    });


    // Fetch all posts with optional search query
    app.get("/volunteerPosts", async (req, res) => {
      const { title } = req.query;
      const query = title ? { title: { $regex: title, $options: "i" } } : {};
      const posts = await volunteerListCollection.find(query).toArray();
      res.send(posts);
    });

    // Fetch volunteer posts sorted by deadline (ascending) with a limit of 6
    app.get("/volunteerNeedsNow", async (req, res) => {
      try {
        const posts = await volunteerListCollection
          .find({})
          .sort({ deadline: 1 })
          .limit(6) 
          .toArray();
        res.send(posts);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch posts", error });
      }
    });




    // Fetch a single post by ID from the database 
    app.get("/volunteerPost/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const post = await volunteerListCollection.findOne(query);
      res.send(post);
    });




    // Fetch posts of the logged-in user by email
    app.get('/my-posts', verifyToken, async (req, res) => {
      const { email } = req.decoded;
      // const { email} = req.query;
      if (!email) {
        return res.status(400).send({ message: 'Email is required' });
      }
    
      try {
        const myPosts = await volunteerListCollection.find({ organizerEmail: email }).toArray();
        res.send(myPosts);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch posts', error });
      }
    });


    // DELETE a post by ID
    app.delete("/volunteerPost/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const query = { _id: new ObjectId(id) };
        const result = await volunteerListCollection.deleteOne(query);
    
        if (result.deletedCount > 0) {
          res.send({ message: "Post deleted successfully" });
        } else {
          res.status(404).send({ message: "Post not found" });
        }
      } catch (error) {
        res.status(500).send({ message: "Failed to delete post", error });
      }
    });

    // Update a post by ID
    app.put("/volunteerPost/:id", async (req, res) => {
      const id = req.params.id;
      const updatedPost = req.body;
    
      try {
        const query = { _id: new ObjectId(id) };
        const update = { $set: updatedPost };
        const result = await volunteerListCollection.updateOne(query, update);
    
        if (result.matchedCount > 0) {
          res.send({ message: "Post updated successfully", result });
        } else {
          res.status(404).send({ message: "Post not found" });
        }
      } catch (error) {
        res.status(500).send({ message: "Failed to update post", error });
      }
    });


    app.post("/requestVolunteer/:id", async (req, res) => {
      const { id } = req.params;
      const requestData = req.body;
    
      try {
        const existingRequest = await volunteerRequestsCollection.findOne({
          requestId: id,
          volunteerEmail: requestData.volunteerEmail,
        });
    
        if (existingRequest) {
          return res.status(400).send({
            message: "You have already submitted a request for this post!",
          });
        }
        await volunteerRequestsCollection.insertOne(requestData);
        await volunteerListCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { volunteersNeeded: -1 } }
        );
    
        res.send({ message: "Request submitted successfully!" });
      } catch (error) {
        res.status(500).send({ message: "Error submitting request", error });
      }
    });
    


  
    app.patch("/volunteerPost/:id", async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;
    
      try {
        const query = { _id: new ObjectId(id) };
        const update = updateData.$inc
          ? { $inc: updateData.$inc }
          : { $set: updateData };
    
        const result = await volunteerListCollection.updateOne(query, update);
    
        if (result.matchedCount > 0) {
          res.send({ message: "Post updated successfully", result });
        } else {
          res.status(404).send({ message: "Post not found" });
        }
      } catch (error) {
        res.status(500).send({ message: "Failed to update post", error });
      }
    });

    // Fetch requests for a specific post owner
    app.get("/requests-by-owner", async (req, res) => {
      const { email } = req.query;
      if (!email) {
        return res.status(400).send({ message: "Organizer email is required" });
      }
    
      try {
        const requests = await volunteerRequestsCollection
          .find({ organizerEmail: email })
          .toArray();
        res.send(requests);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch requests", error });
      }
    });

    // Delete a specific volunteer request by ID
    app.delete("/my-volunteer-requests/:id", async (req, res) => {
      const { id } = req.params;
    
      try {
        const result = await volunteerRequestsCollection.deleteOne({
          _id: new ObjectId(id),
        });
    
        if (result.deletedCount === 1) {
          res.send({ message: "Request deleted successfully" });
        } else {
          res.status(404).send({ message: "Request not found" });
        }
      } catch (error) {
        res.status(500).send({ message: "Failed to delete request", error });
      }
    });





    // Fetch upcoming events
    app.get("/events", async (req, res) => {
      try {
        const events = [
          {
            "id": 1,
            "title": "Park Restoration",
            "description": "Join us to restore the city's oldest park by planting trees and painting benches.",
            "date": "2024-01-10",
            "thumbnail": "https://i.ibb.co.com/4Fg1dMk/images-q-tbn-ANd9-Gc-Q8iz3-MRi-MHw-WNHSYQYu-ERh-J-j1ke-Vd7h-Lktg-s.jpg"
          },
          {
            "id": 2,
            "title": "Homeless Shelter Support",
            "description": "Assist in serving meals and organizing resources at the local shelter.",
            "date": "2024-01-12",
            "thumbnail": "https://i.ibb.co.com/4FqnBG3/images-q-tbn-ANd9-Gc-Ri50a6fo4h-Ns-Ocza2-KCDZel89-Jiy-P9-OGQq-KQ-s.jpg"
          },
          {
            "id": 3,
            "title": "Library Book Drive",
            "description": "Collect and organize book donations to improve literacy in the community.",
            "date": "2024-01-15",
            "thumbnail": "https://i.ibb.co.com/tqv0DQS/images-q-tbn-ANd9-Gc-RJb6-TJ17-LSLi-Lw0o-S2-Gss-MEuq25h-Yvve5-F0qaj-Mye-TYd-Bi6-o-Sqkv-Zz7-QQze-H4d.jpg"
          },
          {
            "id": 4,
            "title": "Community Garden Day",
            "description": "Spend the day gardening and learning about sustainable practices.",
            "date": "2024-01-18",
            "thumbnail": "https://i.ibb.co.com/7Q2SNhq/images-q-tbn-ANd9-Gc-SRMuk-Lma9-W1zdhl-Z4u-Ijkfn-Sd-Jg3-Dg-G7bmsg-s.jpg"
          },
          {
            "id": 5,
            "title": "Elderly Care Visit",
            "description": "Spend quality time with the elderly, sharing stories and helping with activities.",
            "date": "2024-01-20",
            "thumbnail": "https://i.ibb.co.com/8dzzSBh/images-q-tbn-ANd9-Gc-T8gxa90l-i-M3-Jlqh0-Uj-IQGJhj-Y-Ya62-ODQw-s.jpg"
          },
          {
            "id": 6,
            "title": "Wildlife Conservation Workshop",
            "description": "Help raise awareness and participate in activities for local wildlife protection.",
            "date": "2024-01-22",
            "thumbnail": "https://i.ibb.co.com/4PL9KnM/e597cb-9fe141358e77463080562e2eea73246c-mv2.png"
          },
          {
            "id": 7,
            "title": "Neighborhood Cleanup",
            "description": "Join hands with neighbors to clean up and beautify the community.",
            "date": "2024-01-25",
            "thumbnail": "https://i.ibb.co.com/YLHFMbd/clean-it-up-textimage-3x2.jpg"
          },
          {
            "id": 8,
            "title": "Art for Kids",
            "description": "Volunteer to teach art and inspire creativity among children in local schools.",
            "date": "2024-01-30",
            "thumbnail": "https://www.kiwifamilies.co.nz/wp-content/uploads/2022/02/Heart-Art-.jpg"
          }
        ];
        
        res.send(events);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch events", error });
      }
    });


    
    





    
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
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

