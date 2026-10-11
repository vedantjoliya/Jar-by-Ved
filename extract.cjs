const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const jarDir = path.join(__dirname, 'public', 'jar');
const iconDir = path.join(__dirname, 'public', 'icons');

if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

const games = [];
const files = fs.readdirSync(jarDir).filter(f => f.endsWith('.jar') && f !== 'freej2me-web.jar');

files.forEach(file => {
  const jarPath = path.join(jarDir, file);
  const id = file.replace('.jar', '');
  
  let gameName = id;
  let iconFile = null;

  try {
    const zip = new AdmZip(jarPath);
    const zipEntries = zip.getEntries();
    
    // Find manifest
    const manifestEntry = zipEntries.find(e => e.entryName.toLowerCase() === 'meta-inf/manifest.mf');
    
    if (manifestEntry) {
      const manifestStr = zip.readAsText(manifestEntry);
      const lines = manifestStr.split(/\r?\n/);
      
      let midlet1 = null;
      let midletName = null;
      let midletIcon = null;
      
      lines.forEach(line => {
        if (line.startsWith('MIDlet-Name:')) {
          midletName = line.substring('MIDlet-Name:'.length).trim();
        } else if (line.startsWith('MIDlet-1:')) {
          midlet1 = line.substring('MIDlet-1:'.length).trim();
        } else if (line.startsWith('MIDlet-Icon:')) {
          midletIcon = line.substring('MIDlet-Icon:'.length).trim();
        }
      });
      
      if (midletName) gameName = midletName;
      
      // Icon can be in MIDlet-Icon or the second parameter of MIDlet-1
      let iconPath = midletIcon;
      if (!iconPath && midlet1) {
        const parts = midlet1.split(',');
        if (parts.length >= 2) {
          iconPath = parts[1].trim();
        }
      }
      
      if (iconPath) {
        // Strip leading slash if any
        if (iconPath.startsWith('/')) iconPath = iconPath.substring(1);
        
        // Find the actual icon entry ignoring case
        const iconEntry = zipEntries.find(e => e.entryName.toLowerCase() === iconPath.toLowerCase());
        
        if (iconEntry) {
          const iconData = zip.readFile(iconEntry);
          const iconOutPath = path.join(iconDir, `${id}.png`);
          fs.writeFileSync(iconOutPath, iconData);
          iconFile = `/icons/${id}.png`;
        }
      }
    }
    
  } catch (e) {
    console.error(`Error processing ${file}:`, e);
  }

  games.push({
    id,
    file,
    name: gameName,
    icon: iconFile,
    type: 'Java ME Game'
  });
});

fs.writeFileSync(path.join(__dirname, 'public', 'games.json'), JSON.stringify(games, null, 2));
console.log('Extraction complete! Generated games.json');
