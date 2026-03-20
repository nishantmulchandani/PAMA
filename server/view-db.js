/**
 * Database Viewer Script for PAMA
 * Run this script to view the contents of the database
 */

const db = require('./database');
const path = require('path');
const fs = require('fs');

console.log('PAMA Database Viewer');
console.log('===================');

// Get all projects
const projects = db.getAllProjects();
console.log(`\nFound ${projects.length} projects:\n`);

// Display projects
projects.forEach((project, index) => {
  console.log(`Project ${index + 1}: ${project.name}`);
  console.log(`  ID: ${project.id}`);
  console.log(`  Created: ${project.created_at}`);
  console.log(`  Updated: ${project.updated_at}`);
  
  // Get project history
  const history = db.getProjectHistory(project.name);
  console.log(`  Versions: ${history.length}`);
  
  // Get latest version
  const latestData = db.getProjectData(project.name);
  if (latestData) {
    console.log(`  Latest Version: ${latestData.version}`);
    
    // Display summary if available
    const summary = latestData.data.summary;
    if (summary) {
      console.log(`  Summary:`);
      console.log(`    Total Items: ${summary.totalItems || 0}`);
      console.log(`    Compositions: ${summary.compositions || 0}`);
      console.log(`    Videos: ${summary.videos || 0}`);
      console.log(`    Images: ${summary.images || 0}`);
      console.log(`    Audio: ${summary.audio || 0}`);
      console.log(`    Folders: ${summary.folders || 0}`);
    }
    
    // Display compositions
    const comps = latestData.data.comps;
    if (comps && comps.length > 0) {
      console.log(`  Compositions (${comps.length}):`);
      comps.forEach(comp => {
        console.log(`    - ${comp.name} (${comp.duration}s at ${comp.frameRate}fps, ${comp.width}x${comp.height})`);
      });
    }
    
    // Display items
    const items = latestData.data.items;
    if (items && items.length > 0) {
      // Group items by type
      const itemsByType = {};
      items.forEach(item => {
        const type = item.type || 'Unknown';
        if (!itemsByType[type]) {
          itemsByType[type] = [];
        }
        itemsByType[type].push(item);
      });
      
      console.log(`  Items by Type:`);
      Object.keys(itemsByType).forEach(type => {
        console.log(`    ${type}: ${itemsByType[type].length} items`);
      });
      
      // Show first 5 items of each type
      Object.keys(itemsByType).forEach(type => {
        const typeItems = itemsByType[type];
        console.log(`\n  ${type} Items (showing first 5):`);
        typeItems.slice(0, 5).forEach(item => {
          console.log(`    - ${item.name}`);
        });
      });
    }
  }
  
  console.log('\n' + '-'.repeat(50) + '\n');
});

// Close the database connection
db.closeDatabase();
