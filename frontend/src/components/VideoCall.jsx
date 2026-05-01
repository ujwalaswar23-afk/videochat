import React, { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'simple-peer';
import { socket } from '../socket';
import { Phone, Video, PhoneOff, Mic, MicOff, VideoOff } from 'lucide-react';

const VideoCall = ({ username }) => {
  const [stream, setStream] = useState(null);
  const [receivingCall, setReceivingCall] = useState(false);
  const [callerSocketId, setCallerSocketId] = useState("");
  const [callerName, setCallerName] = useState("");
  const [callerSignal, setCallerSignal] = useState(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [remoteSocketId, setRemoteSocketId] = useState(""); // Track who we're in a call with
  
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);

  const myVideo = useRef(null);
  const userVideo = useRef(null);
  const connectionRef = useRef(null);
  const streamRef = useRef(null); // Keep a ref to stream for cleanup

  useEffect(() => {
    const handleIncomingCall = (data) => {
      setReceivingCall(true);
      setCallerSocketId(data.fromId);
      setCallerName(data.from);
      setCallerSignal(data.signal);
    };

    const handleCallEnded = () => {
      cleanupCall();
    };

    const handleCallAccepted = (signal) => {
      setCallAccepted(true);
      setIsCalling(false);
      if (connectionRef.current) {
        connectionRef.current.signal(signal);
      }
    };

    const handleInitiateCall = (e) => {
      const { userToCall, name, type } = e.detail;
      callUser(userToCall, name, type === 'video');
    };

    socket.on('call_incoming', handleIncomingCall);
    socket.on('call_ended', handleCallEnded);
    socket.on('call_accepted', handleCallAccepted);
    window.addEventListener('initiate_call', handleInitiateCall);

    return () => {
      socket.off('call_incoming', handleIncomingCall);
      socket.off('call_ended', handleCallEnded);
      socket.off('call_accepted', handleCallAccepted);
      window.removeEventListener('initiate_call', handleInitiateCall);
    };
  }, []);

  // Attach local stream to video element whenever stream or myVideo changes
  useEffect(() => {
    if (stream && myVideo.current) {
      myVideo.current.srcObject = stream;
    }
  }, [stream, isCalling, callAccepted]);

  const getMediaStream = async (withVideo) => {
    try {
      const currentStream = await navigator.mediaDevices.getUserMedia({ 
        video: withVideo, 
        audio: true 
      });
      setStream(currentStream);
      streamRef.current = currentStream;
      setIsVideoEnabled(withVideo);
      return currentStream;
    } catch (err) {
      console.error("Failed to get media", err);
      alert("Failed to access camera/microphone. Please ensure permissions are granted.");
      return null;
    }
  };

  const callUser = async (targetUsername, name, withVideo) => {
    const mediaStream = await getMediaStream(withVideo);
    if (!mediaStream) return;

    setIsCalling(true);
    setCallerName(name);

    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: mediaStream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ]
      }
    });

    peer.on('signal', (data) => {
      socket.emit('call_user', {
        userToCall: targetUsername,
        signalData: data,
        from: username,
      });
    });

    peer.on('stream', (remoteStream) => {
      // Use a timeout to ensure the video element is rendered
      setTimeout(() => {
        if (userVideo.current) {
          userVideo.current.srcObject = remoteStream;
        }
      }, 100);
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      cleanupCall();
    });

    connectionRef.current = peer;
  };

  const answerCall = async () => {
    setCallAccepted(true);
    setRemoteSocketId(callerSocketId);
    const mediaStream = await getMediaStream(true);
    if (!mediaStream) return;

    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: mediaStream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ]
      }
    });

    peer.on('signal', (data) => {
      socket.emit('answer_call', { signal: data, to: callerSocketId });
    });

    peer.on('stream', (remoteStream) => {
      setTimeout(() => {
        if (userVideo.current) {
          userVideo.current.srcObject = remoteStream;
        }
      }, 100);
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      cleanupCall();
    });

    peer.signal(callerSignal);
    connectionRef.current = peer;
  };

  const cleanupCall = () => {
    if (connectionRef.current) {
      connectionRef.current.destroy();
      connectionRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setCallAccepted(false);
    setReceivingCall(false);
    setIsCalling(false);
    setCallEnded(false);
    setStream(null);
    setCallerSocketId("");
    setCallerName("");
    setCallerSignal(null);
    setRemoteSocketId("");
  };

  const leaveCall = () => {
    if (callerSocketId) {
      socket.emit('end_call', { to: callerSocketId });
    }
    cleanupCall();
  };

  const toggleVideo = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  // If no active call, incoming call, or outgoing call, render nothing
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

      {/* Video Call UI */}
      {(callAccepted || isCalling) && (
        <div className="video-overlay animate-fade-in">
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <h2>{isCalling ? `Calling ${callerName}...` : `Call with ${callerName}`}</h2>
          </div>
          
          <div className="video-grid">
            {/* Local Video */}
            <div className="video-container">
              <video 
                playsInline 
                muted 
                ref={myVideo} 
                autoPlay 
                style={{ display: stream ? 'block' : 'none' }}
              />
              {!stream && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                  Loading camera...
                </div>
              )}
              <div className="video-label">You</div>
            </div>
            
            {/* Remote Video */}
            {callAccepted && (
              <div className="video-container">
                <video 
                  playsInline 
                  ref={userVideo} 
                  autoPlay 
                />
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
