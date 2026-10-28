//! Experimental bookkeeping for clipboard synchronization; no I/O or networking.
use std::collections::{HashSet, VecDeque};

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct EventId { pub device_id: String, pub sequence: u64 }

/// A bounded replay cache. Only call `record_applied` after the OS clipboard write
/// succeeds; failed writes remain eligible for a retry. Device ids must come from
/// an authenticated channel, not from an untrusted display name.
pub struct ReplayGuard {
    capacity: usize,
    seen: HashSet<EventId>,
    order: VecDeque<EventId>,
}
impl ReplayGuard {
    pub fn new(capacity: usize) -> Self {
        Self { capacity, seen: HashSet::new(), order: VecDeque::new() }
    }
    pub fn contains(&self, event: &EventId) -> bool { self.seen.contains(event) }
    pub fn record_applied(&mut self, event: EventId) {
        if self.capacity == 0 || !self.seen.insert(event.clone()) { return; }
        self.order.push_back(event);
        while self.order.len() > self.capacity {
            if let Some(oldest) = self.order.pop_front() { self.seen.remove(&oldest); }
        }
    }
}

/// Distinguishes an OS clipboard change caused by a remote write from a new
/// local copy. Tokens are the exact OS sequence numbers, never contents.
#[derive(Default)]
pub struct EchoGuard { pending: Option<u32> }
impl EchoGuard {
    pub fn mark_remote_write(&mut self, sequence: u32) {
        self.pending = if sequence == 0 { None } else { Some(sequence) };
    }
    pub fn should_forward(&mut self, sequence: u32) -> bool {
        if sequence == 0 { return false; }
        let suppressed = self.pending.take() == Some(sequence);
        !suppressed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn id(device: &str, sequence: u64) -> EventId { EventId { device_id: device.into(), sequence } }
    #[test]
    fn replay_ids_are_scoped_to_device_and_cache_is_bounded() {
        let mut guard = ReplayGuard::new(2);
        let first = id("desktop", 1);
        guard.record_applied(first.clone());
        assert!(guard.contains(&first));
        assert!(!guard.contains(&id("laptop", 1)));
        guard.record_applied(first.clone());
        guard.record_applied(id("laptop", 1));
        guard.record_applied(id("desktop", 2));
        assert!(!guard.contains(&first));
        assert!(guard.contains(&id("laptop", 1)));
    }
    #[test]
    fn suppresses_remote_echo_without_losing_a_new_local_copy() {
        let mut guard = EchoGuard::default();
        guard.mark_remote_write(20);
        assert!(!guard.should_forward(20));
        assert!(guard.should_forward(21));
        guard.mark_remote_write(30);
        assert!(guard.should_forward(31));
        assert!(!guard.should_forward(0));
    }
}
