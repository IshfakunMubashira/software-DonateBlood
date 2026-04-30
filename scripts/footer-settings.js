// scripts/footer-settings.js
import { db } from '../firebase-init.js';   // ✅ fixed path
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

console.log('footer-settings.js loaded');   // debug

async function loadFooterSettings() {
  console.log('loadFooterSettings started');
  try {
    // 1. General settings
    const generalSnap = await getDoc(doc(db, 'settings', 'general'));
    console.log('General snapshot exists?', generalSnap.exists());
    if (generalSnap.exists()) {
      const data = generalSnap.data();
      console.log('General data:', data);
      
      const phoneLink = document.getElementById('footer-phone-link');
      const emailLink = document.getElementById('footer-email-link');
      const addressSpan = document.getElementById('footer-address');
      
      if (phoneLink && data.phone) {
        let phoneNumber = data.phone;
        if (phoneNumber.startsWith('0') && !phoneNumber.startsWith('+')) {
          phoneNumber = '+88' + phoneNumber;
        }
        phoneLink.href = `tel:${phoneNumber}`;
        phoneLink.textContent = phoneNumber;
        console.log('Phone set to:', phoneNumber);
      } else {
        console.warn('phoneLink missing or no phone data');
      }
      
      if (emailLink && data.email) {
        emailLink.href = `mailto:${data.email}`;
        emailLink.textContent = data.email;
        console.log('Email set to:', data.email);
      }
      
      if (addressSpan && data.address) {
        addressSpan.textContent = data.address;
        console.log('Address set to:', data.address);
      }
    } else {
      console.warn('No general settings document');
    }

    // 2. Social links
    const socialSnap = await getDoc(doc(db, 'settings', 'social'));
    if (socialSnap.exists()) {
      const social = socialSnap.data();
      console.log('Social data:', social);
      const fb = document.getElementById('facebook-link');
      const ig = document.getElementById('instagram-link');
      const tw = document.getElementById('twitter-link');
      if (fb) fb.href = social.facebook || '#';
      if (ig) ig.href = social.instagram || '#';
      if (tw) tw.href = social.twitter || '#';
    } else {
      console.warn('No social settings document');
    }
  } catch (error) {
    console.error('Error loading footer settings:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadFooterSettings);
} else {
  loadFooterSettings();
}