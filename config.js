// Daalpha Systems website settings. Change these and re-upload the folder; nothing else needs editing.
// Empty values are simply hidden on the site.
window.DAVETECH = {
  company: 'Daalpha Systems',
  phone: '', // e.g. '0712 345 678' — shows Call buttons
  whatsapp: '', // e.g. '0712345678' — WhatsApp buttons, the Chat bubble and "Choose package" all send messages here
  email: '', // e.g. 'info@davetech.co.ke'
  location: '', // e.g. 'Nairobi, Kenya'
  hours: '', // e.g. 'Mon–Sat, 8am–6pm'
  // Links to your pages; leave empty to hide the icon
  social: { facebook: '', tiktok: '', instagram: '', x: '', linkedin: '', youtube: '' },

  // Packages in the Pricing section. group: 'once' = One-time purchase tab, 'sub' = Pay as you go tab.
  // !!! SAMPLE PRICES — put your real prices here before you upload the site !!!
  // Delete everything inside [ ] to show "Ask for a price" instead.
  pricing: [
    { name: 'Shop POS', group: 'once', price: 'KES 25,000', kind: 'One-time payment',
      notes: ['Installed on one computer or phone', 'Works without internet'],
      items: ['Sales, receipts and M-Pesa', 'Stock, suppliers and expiry dates', 'Customers on credit', 'Daily reports and backups'] },
    { name: 'Shop POS + Online', group: 'once', price: 'KES 35,000', kind: 'One-time payment',
      notes: ['Computer and Android phone app', 'Online owner dashboard'], extra: 'Dashboard needs internet to update',
      items: ['Everything in Shop POS', 'Bluetooth receipt printing on the phone', 'See sales from anywhere', 'Several shops under one login'] },
    { name: 'School system', group: 'once', price: 'KES 45,000', kind: 'One-time payment',
      notes: ['Pre-primary to Grade 9 (CBC)'],
      items: ['Fees, M-Pesa and statements', 'QR attendance with welcome voice', 'Exams and CBC report cards', 'Timetable and staff', 'School website'] },
    { name: 'Yearly plan', group: 'sub', price: 'KES 12,000', per: 'per year', kind: 'Subscription',
      items: ['Full POS on one computer or phone', 'Updates and support included', 'Save with yearly billing'] },
    { name: 'Monthly plan', group: 'sub', price: 'KES 1,200', per: 'per month', kind: 'Subscription',
      items: ['Full POS on one computer or phone', 'Updates and support included', 'Good for small and growing businesses'] },
  ],
};
