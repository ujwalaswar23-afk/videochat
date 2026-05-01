import React, { useState, useEffect, useRef } from 'react';
import Peer from 'simple-peer';
import { socket } from '../socket';
import { Phone, Video, PhoneOff, Mic, MicOff, VideoOff } from 'lucide-react';

const VideoCall = ({ username }) => {
  const [stream, setStream] = useState(null);
  const [receivingCall, setReceivingCall] = useState(false);
  const [caller, setCaller] = useState("");
  const [callerName, setCallerName] = useState("");
  const [callerSignal, setCallerSignal] = useState();
  const [callAccepted, setCallAccepted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);

  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef();

  useEffect(() => {
    // Listen for incoming calls
    socket.on('call_incoming', (data) => {
      setReceivingCall(true);
      setCaller(data.fromId);
      setCallerName(data.from);
      setCallerSignal(data.signal);
    });

    socket.on('call_ended', () => {
      leaveCall(false);
    });

    const handleInitiateCall = (e) => {
      const { userToCall, name, type } = e.detail;
      callUser(userToCall, name, type === 'video');
    };

    window.addEventListener('initiate_call', handleInitiateCall);

    return () => {
      socket.off('call_incoming');
      socket.off('call_ended');
      window.removeEventListener('initiate_call', handleInitiateCall);
    };
  }, []);

  const getMediaStream = async (withVideo) => {
    try {
      const currentStream = await navigator.mediaDevices.getUserMedia({ video: withVideo, audio: true });
      setStream(currentStream);
      setIsVideoEnabled(withVideo);
      if (myVideo.current) {
        myVideo.current.srcObject = currentStream;
      }
      return currentStream;
    } catch (err) {
      console.error("Failed to get media", err);
      alert("Failed to access camera/microphone. Please ensure permissions are granted.");
      return null;
    }
  };

  const callUser = async (id, name, withVideo) => {
    const mediaStream = await getMediaStream(withVideo);
    if (!mediaStream) return;

    setIsCalling(true);
    setCallerName(name);

    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: mediaStream,
    });

    peer.on('signal', (data) => {
      socket.emit('call_user', {
        userToCall: id,
        signalData: data,
        from: username,
      });
    });

    peer.on('stream', (userStream) => {
      if (userVideo.current) {
        userVideo.current.srcObject = userStream;
      }
    });

    socket.on('call_accepted', (signal) => {
      setCallAccepted(true);
      setIsCalling(false);
      peer.signal(signal);
    });

    connectionRef.current = peer;
  };

  const answerCall = async () => {
    setCallAccepted(true);
    const mediaStream = await getMediaStream(true); // Default to video when answering

    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: mediaStream,
    });

    peer.on('signal', (data) => {
      socket.emit('answer_call', { signal: data, to: caller });
    });

    peer.on('stream', (userStream) => {
      if (userVideo.current) {
        userVideo.current.srcObject = userStream;
      }
    });

    peer.signal(callerSignal);
    connectionRef.current = peer;
  };

  const leaveCall = (emitEvent = true) => {
    setCallEnded(true);
    
    if (emitEvent && caller) {
      socket.emit('end_call', { to: caller });
    }

    if (connectionRef.current) {
      connectionRef.current.destroy();
    }
    
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    setTimeout(() => {
      setCallAccepted(false);
      setReceivingCall(false);
      setIsCalling(false);
      setCallEnded(false);
      setStream(null);
      setCaller("");
      setCallerName("");
    }, 1000);
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
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
            <button className="btn btn-danger" onClick={() => leaveCall(true)}>
              <PhoneOff size={18} /> Decline
            </button>
          </div>
        </div>
      )}

      {/* Video Call UI */}
      {(callAccepted || isCalling) && !callEnded && (
        <div className="video-overlay animate-fade-in">
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <h2>{isCalling ? `Calling ${callerName}...` : `Call with ${callerName}`}</h2>
          </div>
          
          <div className="video-grid">
            {/* Local Video */}
            {stream && (
              <div className="video-container">
                <video playsInline muted ref={myVideo} autoPlay />
                <div className="video-label">You</div>
              </div>
            )}
            
            {/* Remote Video */}
            {callAccepted && (
              <div className="video-container">
                <video playsInline ref={userVideo} autoPlay />
                <div className="video-label">{callerName}</div>
              </div>
            )}
          </div>

          <div className="call-controls">
            <button className="call-btn" style={{ background: isAudioEnabled ? 'rgba(255,255,255,0.2)' : 'var(--accent-danger)' }} onClick={toggleAudio}>
              {isAudioEnabled ? <Mic /> : <MicOff />}
            </button>
            <button className="call-btn" style={{ background: isVideoEnabled ? 'rgba(255,255,255,0.2)' : 'var(--accent-danger)' }} onClick={toggleVideo}>
              {isVideoEnabled ? <Video /> : <VideoOff />}
            </button>
            <button className="call-btn end" onClick={() => leaveCall(true)}>
              <PhoneOff />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default VideoCall;
