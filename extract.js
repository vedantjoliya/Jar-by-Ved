const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const jarDir = path.join(__dirname, 'public', 'jar');
const iconsDir = path.join(__dirname, 'public', 'icons');

if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

const games = [];

const files = fs.readdirSync(jarDir).filter(f => f.endsWith('.jar'));

for (const file of files) {
    const jarPath = path.join(jarDir, file);
    try {
        const zip = new AdmZip(jarPath);
        const manifestEntry = zip.getEntry('META-INF/MANIFEST.MF');
        
        let name = file;
        let iconPath = null;
        let finalIconFileName = null;
        
        if (manifestEntry) {
            const manifestContent = zip.readAsText(manifestEntry);
            const lines = manifestContent.split('\n');
            
            let midletName = null;
            let midlet1 = null;
            let midletIcon = null;
            
            for (let line of lines) {
                line = line.trim();
                if (line.startsWith('MIDlet-Name:')) {
                    midletName = line.substring(12).trim();
                } else if (line.startsWith('MIDlet-1:')) {
                    midlet1 = line.substring(9).trim();
                } else if (line.startsWith('MIDlet-Icon:')) {
                    midletIcon = line.substring(12).trim();
                }
            }
            
            if (midletName) name = midletName;
            
            // Try to find icon from MIDlet-Icon or MIDlet-1
            let possibleIconPath = midletIcon;
            if (!possibleIconPath && midlet1) {
                const parts = midlet1.split(',');
                if (parts.length >= 2) {
                    possibleIconPath = parts[1].trim();
                }
            }
            
            if (possibleIconPath) {
                // Ensure no leading slash for adm-zip entry search
                possibleIconPath = possibleIconPath.replace(/^\//, '');
                const iconEntry = zip.getEntry(possibleIconPath);
                if (iconEntry) {
                    finalIconFileName = file.replace('.jar', '.png');
                    const iconOutPath = path.join(iconsDir, finalIconFileName);
                    fs.writeFileSync(iconOutPath, iconEntry.getData());
                }
            }
        }
        
        games.push({
            id: file.replace('.jar', ''),
            file: file,
            name: name,
            type: 'Java ME Game',
            iconUrl: finalIconFileName ? `/icons/${finalIconFileName}` : null
        });
        
    } catch (e) {
        console.error('Error processing', file, e);
    }
}

fs.writeFileSync(path.join(__dirname, 'public', 'games.json'), JSON.stringify(games, null, 2));
console.log('Done extracting games!');
