import React, { useState, useEffect, useRef } from 'react';
import Peer from 'simple-peer';
import { socket } from '../socket';
import { Video, PhoneOff, Mic, MicOff, VideoOff } from 'lucide-react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ]
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
      setRemoteSocketId(data.fromId); // Now we know the answerer's socket ID
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

    const onInitiateCall = (e) => {
      const { userToCall, name, type } = e.detail;
      initiateCall(userToCall, name, type === 'video');
    };

    socket.on('call_incoming', onCallIncoming);
    socket.on('call_accepted', onCallAccepted);
    socket.on('call_ended', onCallEnded);
    socket.on('call_rejected', onCallRejected);
    window.addEventListener('initiate_call', onInitiateCall);

    return () => {
      socket.off('call_incoming', onCallIncoming);
      socket.off('call_accepted', onCallAccepted);
      socket.off('call_ended', onCallEnded);
      socket.off('call_rejected', onCallRejected);
      window.removeEventListener('initiate_call', onInitiateCall);
    };
  }, []);

  // ---- Attach local stream to <video> whenever it changes ----
  useEffect(() => {
    if (stream && myVideo.current) {
      myVideo.current.srcObject = stream;
    }
  }, [stream]);

  // ---- Get camera/mic ----
  const getMediaStream = async (withVideo) => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: withVideo,
        audio: true
      });
      setStream(s);
      streamRef.current = s;
      setIsVideoEnabled(withVideo);
      return s;
    } catch (err) {
      console.error('Failed to get media', err);
      alert('Camera/microphone access denied. Please allow permissions and try again.');
      return null;
    }
  };

  // ---- Caller side: initiate a call ----
  const initiateCall = async (targetUsername, name, withVideo) => {
    const mediaStream = await getMediaStream(withVideo);
    if (!mediaStream) return;

    setIsCalling(true);
    setCallerName(name);

    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: mediaStream,
      config: ICE_SERVERS
    });

    peer.on('signal', (signalData) => {
      socket.emit('call_user', {
        userToCall: targetUsername,
        signalData,
        from: username,
      });
    });

    peer.on('stream', (remoteStream) => {
      console.log('Received remote stream (caller side)');
      attachRemoteStream(remoteStream);
    });

    peer.on('error', (err) => {
      console.error('Peer error (caller):', err);
    });

    connectionRef.current = peer;
  };

  // ---- Receiver side: answer a call ----
  const answerCall = async () => {
    setCallAccepted(true);
    setReceivingCall(false);

    const mediaStream = await getMediaStream(true);
    if (!mediaStream) return;

    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: mediaStream,
      config: ICE_SERVERS
    });

    peer.on('signal', (signalData) => {
      socket.emit('answer_call', { signal: signalData, to: remoteSocketId });
    });

    peer.on('stream', (remoteStream) => {
      console.log('Received remote stream (receiver side)');
      attachRemoteStream(remoteStream);
    });

    peer.on('error', (err) => {
      console.error('Peer error (receiver):', err);
    });

    peer.signal(callerSignal);
    connectionRef.current = peer;
  };

  // ---- Helper: attach remote stream to video element ----
  const attachRemoteStream = (remoteStream) => {
    // Try immediately, then retry after a short delay to handle race conditions
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
