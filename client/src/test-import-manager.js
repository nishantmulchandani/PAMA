/**
 * Quick test script for ImportManager functionality
 * Run with: node test-import-manager.js
 */

const ImportManager = require('./managers/ImportManager.js').default;

function testImportManager() {
  console.log('🧪 Testing ImportManager...');
  
  const manager = ImportManager.getInstance();
  
  // Test 1: Start import for thread1
  console.log('\n1. Starting import for thread1...');
  manager.startImport('thread1', 'bouncing ball', (result) => {
    console.log('✅ Thread1 completion callback:', result);
  });
  
  let state = manager.getUIState('thread1');
  console.log('Thread1 UI state:', state);
  
  // Test 2: Start import for thread2
  console.log('\n2. Starting import for thread2...');
  manager.startImport('thread2', 'spinning logo', (result) => {
    console.log('✅ Thread2 completion callback:', result);
  });
  
  state = manager.getUIState('thread2');
  console.log('Thread2 UI state:', state);
  
  // Test 3: Check both threads have active imports
  console.log('\n3. Checking active imports...');
  console.log('Thread1 has active import:', manager.hasActiveImport('thread1'));
  console.log('Thread2 has active import:', manager.hasActiveImport('thread2'));
  console.log('Thread3 has active import:', manager.hasActiveImport('thread3'));
  
  // Test 4: Complete thread1
  console.log('\n4. Completing thread1...');
  manager.completeImport('thread1', { filename: 'bouncing-ball.json' });
  
  setTimeout(() => {
    console.log('Thread1 UI state after completion:', manager.getUIState('thread1'));
    console.log('Thread2 UI state (should still be active):', manager.getUIState('thread2'));
    
    // Test 5: Cancel thread2
    console.log('\n5. Cancelling thread2...');
    manager.cancelImport('thread2');
    
    setTimeout(() => {
      console.log('Thread2 UI state after cancellation:', manager.getUIState('thread2'));
      console.log('\n✅ All tests completed!');
    }, 600);
  }, 100);
}

// Only run if this file is executed directly
if (require.main === module) {
  testImportManager();
}
