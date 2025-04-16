# Wagyingo Hostels Booking System

A comprehensive hostel booking and management system for Wagyingo Hostels.

## Features

- User authentication and authorization
- Room booking and management
- Payment processing
- Maintenance request system
- Community chat
- Admin dashboard
- Push notifications
- Mobile-responsive design

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- Database: MySQL

## Prerequisites

- Node.js (v14 or higher)
- MySQL (v5.7 or higher)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd hostel-booking-system
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```env
DB_HOST=localhost
DB_USER=your_mysql_username
DB_PASSWORD=your_mysql_password
DB_NAME=hostel_booking
PORT=3000
JWT_SECRET=your_jwt_secret
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
```

4. Initialize the database:
```bash
mysql -u your_mysql_username -p < database/schema.sql
```

5. Start the development server:
```bash
npm run dev
```

## Deployment

### Production Environment Setup

1. Set up a production database:
```bash
mysql -u your_mysql_username -p < database/schema.sql
```

2. Update the `.env` file with production credentials:
```env
NODE_ENV=production
DB_HOST=your_production_db_host
DB_USER=your_production_db_user
DB_PASSWORD=your_production_db_password
DB_NAME=your_production_db_name
PORT=your_production_port
```

3. Build and start the production server:
```bash
npm run build
npm start
```

### Recommended Production Stack

- Node.js application server
- MySQL database
- Nginx reverse proxy
- SSL certificate (Let's Encrypt)
- PM2 process manager

### Security Considerations

1. Enable HTTPS
2. Set up proper CORS policies
3. Implement rate limiting
4. Regular database backups
5. Keep dependencies updated
6. Monitor server logs
7. Set up proper firewall rules

## Maintenance

### Database Backups

```bash
# Create backup
mysqldump -u username -p database_name > backup.sql

# Restore backup
mysql -u username -p database_name < backup.sql
```

### Log Rotation

Set up log rotation for:
- Application logs
- Access logs
- Error logs
- Database logs

## Support

For support, contact the development team at [support-email]

## License

This project is licensed under the MIT License - see the LICENSE file for details. 