# SponsorConnect

SponsorConnect is a web platform that connects sponsors with individuals or organizations seeking sponsorship. The platform facilitates seamless interactions between sponsors and seekers, making it easier to create, manage, and respond to sponsorship opportunities.

## Features

### For Sponsors
- Create and manage sponsorship listings
- Browse through sponsorship requests
- Track sponsorship history and transactions
- Manage company profile and budget
- View and interact with potential sponsorship candidates

### For Sponsorship Seekers
- Create detailed sponsorship requests
- Showcase projects or events needing sponsorship
- Track received sponsorships
- Manage personal/organization profile
- Direct interaction with potential sponsors

## Technology Stack

- **Backend**: Node.js with Express.js
- **Frontend**: EJS templating engine with vanilla JavaScript
- **Database**: MongoDB
- **Authentication**: Passport.js
- **Styling**: Custom CSS with responsive design
- **Icons**: Font Awesome

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm (Node Package Manager)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/sponsorconnect.git
cd sponsorconnect
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory and add the following:
```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/sponsorconnect
SESSION_SECRET=your_session_secret_here
```

4. Start MongoDB service:
```bash
mongod
```

5. Run the application:
```bash
npm start
```

The application will be available at `http://localhost:3001`

## Project Structure

```
sponsorconnect/
├── app.js              # Application entry point
├── models/             # Database models
│   ├── User.js
│   ├── Listing.js
│   └── Sponsorship.js
├── routes/            # Route handlers
│   ├── auth.js
│   ├── dashboard.js
│   └── profile.js
├── views/             # EJS templates
│   ├── dashboard.ejs
│   ├── profile.ejs
│   └── ...
├── public/            # Static files
│   ├── css/
│   └── js/
└── config/           # Configuration files
    └── passport.js
```

## Features in Detail

### User Management
- User registration and authentication
- Role-based access (Sponsor/Seeker)
- Profile management
- Session handling

### Listing Management
- Create, read, update, and delete listings
- Filter and search functionality
- Status tracking (Active/Pending/Closed)
- Automatic default listing creation for new users

### Profile Features
- Detailed user profiles
- Transaction history
- Statistics dashboard
- Profile editing capabilities

### Security Features
- Password hashing
- Session management
- Protected routes
- Input validation

## API Endpoints

### Authentication Routes
- `POST /auth/signup` - User registration
- `POST /auth/login` - User login
- `GET /auth/logout` - User logout

### Profile Routes
- `GET /profile` - View profile
- `POST /profile/update` - Update profile
- `POST /profile/listing` - Create listing
- `PUT /profile/listing/:id` - Update listing
- `DELETE /profile/listing/:id` - Delete listing

### Dashboard Routes
- `GET /dashboard` - View dashboard
- `GET /dashboard/listings` - View all listings
- `POST /dashboard/sponsor` - Create sponsorship

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, please email support@sponsorconnect.com or open an issue in the GitHub repository.

## Acknowledgments

- Thanks to all contributors who have helped shape SponsorConnect
- Special thanks to the open-source community for the tools and libraries used in this project 