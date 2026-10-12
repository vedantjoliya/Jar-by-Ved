export default {
    async Java_pl_zb3_freej2me_bridge_media_MidiBridge_getMidiPlayer(lib) {
        if (!window.libmidi || !window.libmidi.midiPlayer) {
            return {
                setSequence: async () => {},
                play: () => {},
                loop: () => {},
                stop: () => {},
                shortEvent: () => {},
                getPosition: async () => 0,
                seek: () => {},
                volume: 1,
                duration: 0
            };
        }
        return window.libmidi.midiPlayer;
    },
    async Java_pl_zb3_freej2me_bridge_media_MidiBridge_midiSetSequence(lib, player, sequence) {
        if (player && player.setSequence && sequence) {
            try {
                await player.setSequence(sequence.buffer);
                return player.duration !== undefined ? player.duration : -1;
            } catch (err) {
                console.warn("MidiBridge setSequence warning:", err);
            }
        }
        return -1;
    },
    async Java_pl_zb3_freej2me_bridge_media_MidiBridge_midiPlay(lib, player) {
        if (player && player.play) {
            try { player.play(); } catch(e) {}
        }
    },
    async Java_pl_zb3_freej2me_bridge_media_MidiBridge_midiLoop(lib, player, times) {
        if (player && player.loop) {
            try { player.loop(times); } catch(e) {}
        }
    },
    async Java_pl_zb3_freej2me_bridge_media_MidiBridge_midiStop(lib, player) {
        if (player && player.stop) {
            try { player.stop(); } catch(e) {}
        }
    },
    async Java_pl_zb3_freej2me_bridge_media_MidiBridge_midiShortEvent(lib, player, status, data1, data2) {
        if (player && player.shortEvent) {
            try { player.shortEvent(status, data1, data2); } catch(e) {}
        }
    },
    async Java_pl_zb3_freej2me_bridge_media_MidiBridge_midiGetPosition(lib, player) {
        if (player && player.getPosition) {
            try { return await player.getPosition(); } catch(e) {}
        }
        return 0;
    },
    async Java_pl_zb3_freej2me_bridge_media_MidiBridge_midiSeek(lib, player, pos) {
        if (player && player.seek) {
            try { player.seek(pos); } catch(e) {}
        }
    },
    async Java_pl_zb3_freej2me_bridge_media_MidiBridge_midiGetVolume(lib, player) {
        return (player && player.volume !== undefined) ? player.volume : 1;
    },
    async Java_pl_zb3_freej2me_bridge_media_MidiBridge_midiSetVolume(lib, player, vol) {
        if (player) {
            player.volume = vol;
        }
    },
}

