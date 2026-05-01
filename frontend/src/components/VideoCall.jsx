import React, { useState, useEffect, useRef } from 'react';
import Peer from 'simple-peer';
import { socket } from '../socket';
import { Video, PhoneOff, Mic, MicOff, VideoOff } from 'lucide-react';

// ICE servers for NAT traversal - includes free TURN servers for better connectivity
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Free TURN servers for relay when direct connection fails
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
  ]
};

// HD Video constraints
const HD_VIDEO_CONSTRAINTS = {
  video: {
    width: { ideal: 1920, min: 1280 },
    height: { ideal: 1080, min: 720 },
    frameRate: { ideal: 30, min: 24 },
    facingMode: 'user'
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000
  }
};

// Fallback for devices that can't do HD
const SD_VIDEO_CONSTRAINTS = {
  video: {
    width: { ideal: 1280, min: 640 },
    height: { ideal: 720, min: 480 },
    frameRate: { ideal: 30 },
    facingMode: 'user'
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
};

const VideoCall = ({ username }) => {
  const [stream, setStream] = useState(null);
  const [receivingCall, setReceivingCall] = useState(false);
  const [remoteSocketId, setRemoteSocketId] = useState('');
  const [callerName, setCallerName] = useState('');
  const [callerSignal, setCallerSignal] = useState(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [isCalling, setIsCalling] = useState(false);

  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);

  const myVideo = useRef(null);
  const userVideo = useRef(null);
  const connectionRef = useRef(null);
  const streamRef = useRef(null);

  // ---- Socket listeners (run once) ----
  useEffect(() => {
    const onCallIncoming = (data) => {
      console.log('Incoming call from', data.from);
      setReceivingCall(true);
      setRemoteSocketId(data.fromId);
      setCallerName(data.from);
      setCallerSignal(data.signal);
    };

    const onCallAccepted = (data) => {
      console.log('Call accepted, signaling peer');
      setCallAccepted(true);
      setIsCalling(false);
      setRemoteSocketId(data.fromId);
      if (connectionRef.current && !connectionRef.current.destroyed) {
        connectionRef.current.signal(data.signal);
      }
    };

    const onCallEnded = () => {
      console.log('Remote user ended the call');
      cleanupCall();
    };

    const onCallRejected = (data) => {
      alert(data.reason || 'Call could not be connected');
      cleanupCall();
    };

    // Handle trickle ICE candidates from remote
    const onIceCandidate = (data) => {
      if (connectionRef.current && !connectionRef.current.destroyed) {
        connectionRef.current.signal(data.signal);
      }
    };

    const onInitiateCall = (e) => {
      const { userToCall, name, type } = e.detail;
      initiateCall(userToCall, name, type === 'video');
    };

    socket.on('call_incoming', onCallIncoming);
    socket.on('call_accepted', onCallAccepted);
    socket.on('call_ended', onCallEnded);
    socket.on('call_rejected', onCallRejected);
    socket.on('ice_candidate', onIceCandidate);
    window.addEventListener('initiate_call', onInitiateCall);

    return () => {
      socket.off('call_incoming', onCallIncoming);
      socket.off('call_accepted', onCallAccepted);
      socket.off('call_ended', onCallEnded);
      socket.off('call_rejected', onCallRejected);
      socket.off('ice_candidate', onIceCandidate);
      window.removeEventListener('initiate_call', onInitiateCall);
    };
  }, []);

  // ---- Attach local stream to <video> whenever it changes ----
  useEffect(() => {
    if (stream && myVideo.current) {
      myVideo.current.srcObject = stream;
    }
  }, [stream]);

  // ---- Get HD camera/mic ----
  const getMediaStream = async (withVideo) => {
    if (!withVideo) {
      // Audio only call
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: HD_VIDEO_CONSTRAINTS.audio
        });
        setStream(s);
        streamRef.current = s;
        setIsVideoEnabled(false);
        return s;
      } catch (err) {
        console.error('Failed to get audio', err);
        alert('Microphone access denied.');
        return null;
      }
    }

    // Try HD first, fall back to SD
    try {
      const s = await navigator.mediaDevices.getUserMedia(HD_VIDEO_CONSTRAINTS);
      console.log('Got HD stream:', s.getVideoTracks()[0].getSettings());
      setStream(s);
      streamRef.current = s;
      setIsVideoEnabled(true);
      return s;
    } catch (err) {
      console.warn('HD not available, trying SD...', err);
      try {
        const s = await navigator.mediaDevices.getUserMedia(SD_VIDEO_CONSTRAINTS);
        console.log('Got SD stream:', s.getVideoTracks()[0].getSettings());
        setStream(s);
        streamRef.current = s;
        setIsVideoEnabled(true);
        return s;
      } catch (err2) {
        console.error('Failed to get any video', err2);
        alert('Camera/microphone access denied. Please allow permissions and try again.');
        return null;
      }
    }
  };

  // ---- Create a peer with optimized settings ----
  const createPeer = (initiator, mediaStream) => {
    const peer = new Peer({
      initiator,
      trickle: true, // Enable trickle ICE for faster connection
      stream: mediaStream,
      config: ICE_CONFIG,
      // SDP transform to prefer high bitrate
      sdpTransform: (sdp) => {
        // Increase video bitrate to 4 Mbps for HD
        sdp = sdp.replace(/b=AS:\d+/g, 'b=AS:4000');
        // If no bandwidth line exists, add it after video m-line
        if (!sdp.includes('b=AS:')) {
          sdp = sdp.replace(/m=video (.*)\r\n/, 'm=video $1\r\nb=AS:4000\r\n');
        }
        return sdp;
      }
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
    });

    return peer;
  };

  // ---- Caller side: initiate a call ----
  const initiateCall = async (targetUsername, name, withVideo) => {
    const mediaStream = await getMediaStream(withVideo);
    if (!mediaStream) return;

    setIsCalling(true);
    setCallerName(name);

    const peer = createPeer(true, mediaStream);

    peer.on('signal', (signalData) => {
      if (signalData.type === 'offer') {
        socket.emit('call_user', {
          userToCall: targetUsername,
          signalData,
          from: username,
        });
      } else {
        // Trickle ICE candidate
        socket.emit('ice_candidate', {
          to: targetUsername,
          signal: signalData,
        });
      }
    });

    peer.on('stream', (remoteStream) => {
      console.log('Received remote stream (caller side)');
      attachRemoteStream(remoteStream);
    });

    connectionRef.current = peer;
  };

  // ---- Receiver side: answer a call ----
  const answerCall = async () => {
    setCallAccepted(true);
    setReceivingCall(false);

    const mediaStream = await getMediaStream(true);
    if (!mediaStream) return;

    const peer = createPeer(false, mediaStream);

    peer.on('signal', (signalData) => {
      if (signalData.type === 'answer') {
        socket.emit('answer_call', { signal: signalData, to: remoteSocketId });
      } else {
        // Trickle ICE candidate
        socket.emit('ice_candidate', {
          toSocketId: remoteSocketId,
          signal: signalData,
        });
      }
    });

    peer.on('stream', (remoteStream) => {
      console.log('Received remote stream (receiver side)');
      attachRemoteStream(remoteStream);
    });

    peer.signal(callerSignal);
    connectionRef.current = peer;
  };

  // ---- Helper: attach remote stream to video element ----
  const attachRemoteStream = (remoteStream) => {
    const attach = () => {
      if (userVideo.current) {
        userVideo.current.srcObject = remoteStream;
        console.log('Remote stream attached');
      }
    };
    attach();
    setTimeout(attach, 200);
    setTimeout(attach, 500);
  };

  // ---- Cleanup everything ----
  const cleanupCall = () => {
    if (connectionRef.current) {
      connectionRef.current.destroy();
      connectionRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    setStream(null);
    setCallAccepted(false);
    setReceivingCall(false);
    setIsCalling(false);
    setCallerName('');
    setCallerSignal(null);
    setRemoteSocketId('');
  };

  // ---- Hang up ----
  const leaveCall = () => {
    if (remoteSocketId) {
      socket.emit('end_call', { to: remoteSocketId });
    }
    cleanupCall();
  };

  // ---- Toggles ----
  const toggleVideo = () => {
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsVideoEnabled(track.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (streamRef.current) {
      const track = streamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsAudioEnabled(track.enabled);
      }
    }
  };

  // ---- Render nothing if no call activity ----
  if (!receivingCall && !callAccepted && !isCalling) return null;

  return (
    <>
      {/* Incoming Call Modal */}
      {receivingCall && !callAccepted && (
        <div className="incoming-call-modal animate-fade-in">
          <div className="incoming-header">
            <div className="user-avatar">{callerName.charAt(0).toUpperCase()}</div>
            <div>
              <div style={{ fontWeight: 'bold' }}>{callerName}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Incoming video call...</div>
            </div>
          </div>
          <div className="incoming-actions">
            <button className="btn btn-primary" onClick={answerCall}>
              <Video size={18} /> Answer
            </button>
            <button className="btn btn-danger" onClick={leaveCall}>
              <PhoneOff size={18} /> Decline
            </button>
          </div>
        </div>
      )}

      {/* Video Call Overlay */}
      {(callAccepted || isCalling) && (
        <div className="video-overlay animate-fade-in">
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <h2>{isCalling ? `Calling ${callerName}...` : `Call with ${callerName}`}</h2>
          </div>

          <div className="video-grid">
            {/* Local Video */}
            <div className="video-container">
              {stream ? (
                <video playsInline muted ref={myVideo} autoPlay />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                  Loading camera...
                </div>
              )}
              <div className="video-label">You</div>
            </div>

            {/* Remote Video */}
            {callAccepted && (
              <div className="video-container">
                <video playsInline ref={userVideo} autoPlay />
                <div className="video-label">{callerName}</div>
              </div>
            )}
          </div>

          <div className="call-controls">
            <button className="call-btn" style={{ background: isAudioEnabled ? 'rgba(255,255,255,0.2)' : 'var(--accent-danger)', color: 'white' }} onClick={toggleAudio}>
              {isAudioEnabled ? <Mic /> : <MicOff />}
            </button>
            <button className="call-btn" style={{ background: isVideoEnabled ? 'rgba(255,255,255,0.2)' : 'var(--accent-danger)', color: 'white' }} onClick={toggleVideo}>
              {isVideoEnabled ? <Video /> : <VideoOff />}
            </button>
            <button className="call-btn end" onClick={leaveCall}>
              <PhoneOff />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default VideoCall;
