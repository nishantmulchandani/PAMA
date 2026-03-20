/**
 * PAMA_scanProject - Scan After Effects project and return structure as JSON
 * Enhanced version with file type classification and summary statistics
 * @returns {string} JSON representation of the project structure
 */
function PAMA_scanProject() {
  try {
    // Add debug info to help troubleshoot
    $.writeln("PAMA: Starting project scan...");

    var project = app.project;

    // Initialize result with both original structure and new format
    var result = {
      comps: [],
      footage: [],
      items: [],
      summary: {
        totalItems: 0,
        compositions: 0,
        videos: 0,
        images: 0,
        audio: 0,
        folders: 0,
        psd: 0,
        illustratorFiles: 0
      }
    };

    // Check if project exists and has items
    if (!project) {
      $.writeln("PAMA: No project found");
      return JSON.stringify({ error: "No active project" });
    }

    if (!project.numItems) {
      $.writeln("PAMA: Project has no items");
      return JSON.stringify(result);
    }

    $.writeln("PAMA: Scanning " + project.numItems + " project items");

    // Helper functions for file type detection
    function inArray(arr, val) {
      for (var j = 0; j < arr.length; j++) {
        if (arr[j] === val) return true;
      }
      return false;
    }

    function safeExt(fileName) {
      if (!fileName) return "";
      var dot = fileName.lastIndexOf('.');
      return dot !== -1 ? fileName.substr(dot + 1).toLowerCase() : "";
    }

    // File type lookup tables
    var videoExt = ["mp4", "mov", "avi", "mkv", "wmv", "flv", "mpeg"];
    var imageExt = ["png", "jpg", "jpeg", "gif", "bmp", "tiff"];
    var audioExt = ["mp3", "wav", "aac", "flac", "ogg", "m4a"];

    // Scan all project items
    for (var i = 1; i <= project.numItems; i++) {
      var item = project.item(i);

      if (!item) {
        $.writeln("PAMA: Skipping null item at index " + i);
        continue;
      }

      // Create a common data object for the items array with more metadata
      var itemData = {
        index: i,
        id: i,  // Add id field for consistency with MyAEPScannerExtension
        name: item.name,
        parentFolder: item.parentFolder ? item.parentFolder.id : 0,
        selected: item.selected,
        label: item.label
      };

      // Handle Composition items
      if (item instanceof CompItem) {
        $.writeln("PAMA: Found composition: " + item.name);

        // Update summary
        result.summary.compositions++;

        // Set item type for the flat items array
        itemData.type = "Composition";
        itemData.width = item.width;
        itemData.height = item.height;
        itemData.duration = item.duration;
        itemData.frameRate = item.frameRate;
        itemData.pixelAspect = item.pixelAspect;

        var compData = {
          name: item.name,
          id: i,
          duration: item.duration,
          frameRate: item.frameRate,
          width: item.width,
          height: item.height,
          markers: [],
          layers: []
        };

        // Composition markers (timeline markers)
        if (item.markerProperty && item.markerProperty.numKeys > 0) {
          $.writeln("PAMA: Scanning " + item.markerProperty.numKeys + " markers in comp " + item.name);
          for (var m = 1; m <= item.markerProperty.numKeys; m++) {
            var markerVal = item.markerProperty.valueAtTime(item.markerProperty.keyTime(m), false);
            compData.markers.push({
              time: item.markerProperty.keyTime(m),
              comment: markerVal.comment
            });
          }
        }

        // Layers in composition
        $.writeln("PAMA: Scanning " + item.numLayers + " layers in comp " + item.name);
        for (var j = 1; j <= item.numLayers; j++) {
          try {
            var layer = item.layer(j);
            var layerType = "Layer";
            var sourceItem = null;

            // Determine layer type
            if (layer instanceof AVLayer && layer.source !== null) {
              sourceItem = layer.source.id;

              if (layer.source instanceof CompItem) {
                layerType = "PrecompLayer";
              } else if (layer.source instanceof FootageItem) {
                layerType = "FootageLayer";
              } else {
                layerType = "AVLayer";
              }
            } else if (layer instanceof TextLayer) {
              layerType = "TextLayer";
            } else if (layer instanceof ShapeLayer) {
              layerType = "ShapeLayer";
            } else if (layer instanceof CameraLayer) {
              layerType = "CameraLayer";
            } else if (layer instanceof LightLayer) {
              layerType = "LightLayer";
            }

            $.writeln("PAMA: Found layer: " + layer.name + " (" + layerType + ")");

            var layerData = {
              name: layer.name,
              index: j,
              type: layerType,
              inPoint: layer.inPoint,
              outPoint: layer.outPoint,
              source: sourceItem,
              markers: [],
              isVisible: !layer.enabled // In AE, "enabled" means visible
            };

            // Layer markers
            if (layer.marker && layer.marker.numKeys > 0) {
              for (var k = 1; k <= layer.marker.numKeys; k++) {
                var lMarkerVal = layer.marker.keyAtTime(layer.marker.keyTime(k), false);
                layerData.markers.push({
                  time: layer.marker.keyTime(k),
                  comment: lMarkerVal.comment
                });
              }
            }

            compData.layers.push(layerData);
          } catch (layerError) {
            $.writeln("PAMA: Error processing layer " + j + ": " + layerError.toString());
          }
        }

        result.comps.push(compData);
      }
      // Handle Footage items
      else if (item instanceof FootageItem) {
        $.writeln("PAMA: Found footage: " + item.name);

        // Get file details
        var src = item.mainSource;
        var file = src && src.file;
        var fileName = file ? file.name : "";
        var ext = safeExt(fileName);

        // Set common properties with more detailed metadata
        itemData.filePath = file ? file.fsName : "";
        itemData.fileType = ext;
        itemData.type = "Footage";  // Default type, just like in MyAEPScannerExtension
        itemData.isVideo = inArray(videoExt, ext) ? 1 : 0;  // Add binary flags for easier filtering
        itemData.isImage = inArray(imageExt, ext) ? 1 : 0;
        itemData.isAudio = inArray(audioExt, ext) ? 1 : 0;
        itemData.isPSD = ext === "psd" ? 1 : 0;
        itemData.isIllustrator = ext === "ai" ? 1 : 0;

        // Add dimensions and duration if available
        if (item.width) itemData.width = item.width;
        if (item.height) itemData.height = item.height;
        if (item.duration) itemData.duration = item.duration;
        if (item.frameRate) itemData.frameRate = item.frameRate;
        if (item.pixelAspect) itemData.pixelAspect = item.pixelAspect;

        // Classify footage by file extension
        if (inArray(videoExt, ext)) {
          itemData.type = "Video";
          result.summary.videos++;
        }
        else if (inArray(imageExt, ext)) {
          itemData.type = "Image";
          result.summary.images++;
        }
        else if (inArray(audioExt, ext)) {
          itemData.type = "Audio";
          result.summary.audio++;
        }
        else if (ext === "psd") {
          itemData.type = "PSD";
          result.summary.psd++;
        }
        else if (ext === "ai") {
          itemData.type = "Illustrator";
          result.summary.illustratorFiles++;
        }

        // Create the traditional PAMA footage data
        var footageData = {
          name: item.name,
          id: i,
          filePath: file ? file.fsName : null,
          width: item.width,
          height: item.height,
          duration: item.duration,
          mainSource: item.mainSource.toString(),  // Type of source (SolidSource, FileSource, etc.)
          fileType: ext,
          itemType: itemData.type  // Add the classified type to the traditional structure
        };

        // Add solid color information if it's a solid
        if (item.mainSource instanceof SolidSource) {
          footageData.color = item.mainSource.color.toString();
        }

        result.footage.push(footageData);
      }
      // Handle Folder items
      else if (item instanceof FolderItem) {
        $.writeln("PAMA: Found folder: " + item.name);
        itemData.type = "Folder";
        result.summary.folders++;
      }
      else {
        // Unknown item type
        itemData.type = "Unknown";
      }

      // Increment total items counter (same position as in MyAEPScannerExtension)
      result.summary.totalItems++;

      // Add to the flat items array
      result.items.push(itemData);
    }

    // Log detailed summary
    $.writeln("PAMA: Scan complete. Summary:");
    $.writeln("  Total Items: " + result.summary.totalItems);
    $.writeln("  Compositions: " + result.summary.compositions);
    $.writeln("  Videos: " + result.summary.videos);
    $.writeln("  Images: " + result.summary.images);
    $.writeln("  Audio: " + result.summary.audio);
    $.writeln("  PSD: " + result.summary.psd);
    $.writeln("  Illustrator: " + result.summary.illustratorFiles);
    $.writeln("  Folders: " + result.summary.folders);

    // Try to safely serialize the result
    try {
      return JSON.stringify(result);
    } catch (jsonError) {
      $.writeln("PAMA ERROR: Failed to stringify result: " + jsonError.toString());
      // Return a simplified result if full serialization fails
      return JSON.stringify({
        error: "Failed to stringify full result: " + jsonError.toString(),
        summary: result.summary
      });
    }
  } catch (error) {
    $.writeln("PAMA ERROR: " + error.toString());
    return JSON.stringify({ error: error.toString() });
  }
}

/**
 * PAMA_simpleScan - A simplified version of the scan function for debugging
 * @returns {string} JSON string with basic project info
 */
function PAMA_simpleScan() {
  try {
    $.writeln("PAMA: Starting simple project scan...");

    var project = app.project;
    if (!project) {
      return JSON.stringify({ error: "No active project" });
    }

    var result = {
      projectName: project.file ? project.file.name : "Untitled Project",
      numItems: project.numItems,
      items: []
    };

    // Just get basic info about the first 10 items
    for (var i = 1; i <= Math.min(project.numItems, 10); i++) {
      var item = project.item(i);
      if (item) {
        var itemInfo = {
          index: i,
          name: item.name,
          type: item instanceof CompItem ? "Composition" :
                item instanceof FootageItem ? "Footage" :
                item instanceof FolderItem ? "Folder" : "Unknown"
        };
        result.items.push(itemInfo);
      }
    }

    $.writeln("PAMA: Simple scan complete. Found " + result.numItems + " items");
    return JSON.stringify(result);
  } catch (error) {
    $.writeln("PAMA ERROR in simple scan: " + error.toString());
    return JSON.stringify({ error: error.toString() });
  }
}

// Make functions available globally for CEP to call
if (typeof module === 'object' && module && typeof module.exports === 'object') {
  module.exports = {
    PAMA_scanProject: PAMA_scanProject,
    PAMA_simpleScan: PAMA_simpleScan
  };
}

// IMPORTANT: Removed the self-executing function that was causing issues
// (function(){ return PAMA_scanProject(); })();
