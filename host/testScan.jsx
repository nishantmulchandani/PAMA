/**
 * Simple test function to verify ExtendScript is working
 */
function testScan() {
  try {
    var project = app.project;
    var result = {
      success: true,
      message: "ExtendScript is working!",
      projectInfo: {
        name: project.file ? project.file.name : "Untitled Project",
        numItems: project.numItems
      }
    };
    
    // Log to ExtendScript console
    $.writeln("Test scan successful: " + JSON.stringify(result));
    
    return JSON.stringify(result);
  } catch (error) {
    $.writeln("Test scan error: " + error.toString());
    return JSON.stringify({
      success: false,
      error: error.toString()
    });
  }
}

// Self-executing function for CEP
(function() {
  return testScan();
})();
