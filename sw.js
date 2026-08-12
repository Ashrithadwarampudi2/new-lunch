// sw.js - Service Worker for Commvault Lunch Portal
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};

  const title = data.title || ' Commvault Lunch Update';
  const options = {
    body: data.message || 'A new lunch update has been posted!',
    icon: 'images/images/commvault-logo.png',
    badge: 'images/images/commvault-logo.png'
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Redirect user to home.html when clicking the desktop notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/home.html')
  );
});

