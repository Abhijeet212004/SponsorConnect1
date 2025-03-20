# SponsorConnect Deployment Guide

This guide will walk you through deploying SponsorConnect for free without requiring a credit card.

## Step 1: Prepare Your Repository for Deployment

1. Make sure your code is in a GitHub repository.
2. If not, create a new repository on GitHub and push your code:

```bash
# Initialize git repository if needed
git init

# Add all files
git add .

# Commit changes
git commit -m "Initial commit"

# Add GitHub repository as remote
git remote add origin https://github.com/yourusername/repository-name.git

# Push to GitHub
git push -u origin main
```

## Step 2: Set Up MongoDB Atlas (Free Tier)

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and sign up for a free account.

2. After signing up, create a new cluster:
   - Click "Build a Cluster"
   - Choose the "FREE" tier
   - Select your preferred cloud provider and region
   - Click "Create Cluster"

3. While your cluster is being created (takes a few minutes), set up database access:
   - Go to the "Database Access" section
   - Click "Add New Database User"
   - Create a username and password (save these credentials)
   - Set privileges to "Read and Write to Any Database"
   - Click "Add User"

4. Set up network access:
   - Go to "Network Access"
   - Click "Add IP Address"
   - To allow access from anywhere, click "Allow Access from Anywhere" or add "0.0.0.0/0"
   - Click "Confirm"

5. Once your cluster is created, connect to it:
   - Click "Connect"
   - Choose "Connect your application"
   - Select "Node.js" and the latest version
   - Copy the connection string (it looks like: `mongodb+srv://username:<password>@cluster0.xxxxx.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`)
   - Replace `<password>` with your user's password
   - Replace `myFirstDatabase` with `sponsorconnect`

## Step 3: Deploy to Render (Free Tier)

1. Go to [Render](https://render.com/) and sign up for a free account.

2. Once logged in, click "New" and select "Web Service".

3. Connect your GitHub account if you haven't already, and select your repository.

4. Configure your web service:
   - Name: `sponsorconnect` (or any name you prefer)
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `node app.js`
   - Select the free plan

5. Add environment variables (from your .env file):
   - Click "Advanced" > "Add Environment Variable"
   - Add the following key-value pairs:
     - `MONGODB_URI`: Your MongoDB Atlas connection string
     - `SESSION_SECRET`: Your session secret
     - `NODE_ENV`: `production`
     - Add all other variables from your .env file

6. Click "Create Web Service".

7. Render will automatically build and deploy your application. This might take a few minutes.

8. Once deployed, you'll get a URL like `https://sponsorconnect.onrender.com` where your application is live.

## Step 4: Update OAuth Redirect URLs (if using Google, etc.)

If your application uses OAuth with Google or other providers, update the redirect URLs in their developer consoles to point to your new Render URL.

## Step 5: Test Your Deployment

1. Visit your Render URL to ensure your application is working correctly.

2. Test all main features, including user authentication, database operations, etc.

## Troubleshooting

- **Connection Errors**: Ensure your MongoDB URI is correct and the user has proper permissions.
- **Application Errors**: Check Render logs for any errors by clicking on your service and viewing the logs.
- **Missing Environment Variables**: Verify all required environment variables are set in Render.

## Maintaining Your Free Tier

- Render's free tier may spin down your service after periods of inactivity. The first request after inactivity will take a moment to respond.
- MongoDB Atlas free tier has limitations on storage and connections, but it's sufficient for development and small applications.

---

Your application is now deployed for free without requiring a credit card! If you have any questions or issues, please refer to the [Render Documentation](https://render.com/docs) or [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/).
