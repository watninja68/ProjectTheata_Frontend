import React from 'react';
// Changed from lucide-react to react-icons/fa for consistency with App.js
import { BsLayoutSidebar, FaPlus, FaBars } from 'react-icons/fa'; 
import { GrChapterAdd } from 'react-icons/gr'; // For the "New Conversation" button

// Renamed props for clarity and consistency:
// isCollapsed (from App.js: isLeftSidebarCollapsed)
// toggleCollapse (from App.js: toggleLeftSidebar)
// conversations (data for the list)
// onSelectConversation (from App.js: handleSelectChat)
// onCreateNewConversation (from App.js: handleCreateChat)
const Sidebar = ({ isCollapsed, toggleCollapse, conversations, onSelectConversation, onCreateNewConversation }) => {
  return (
    // Ensure this div has className="conversation-history-sidebar" for App.css styles
    // The className is dynamically added here, which is good.
    <div className={`conversation-history-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="conv-history-header">
        {/* Relocated Collapse Button - uses sidebar-toggle-btn class from App.css */}
        <button 
          onClick={toggleCollapse} 
          className="sidebar-toggle-btn" // This class should exist in App.css
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {/* Using FaBars when collapsed, FaChevronLeft when expanded, similar to App.js left toggle */}
          {isCollapsed ? <FaBars size={20} /> : <BsLayoutSidebar size={20} />}
        </button>
      </div>

      {/* Transformed 'New Conversation' Button */}
      <button onClick={onCreateNewConversation} className="new-conversation-btn">
        <GrChapterAdd size={18} style={{ marginRight: '0.5rem' }} /> 
        <span>New Conversation</span>
      </button>

      {/* Separation Line */}
      <hr className="sidebar-separator" />

      {/* Chat History List */}
      <div className="conv-history-list">
        {conversations && conversations.length > 0 ? (
          conversations.map((conv) => (
            <div
              key={conv.id} // Assuming conversation objects have an 'id'
              className="conv-history-item"
              onClick={() => onSelectConversation(conv)} // Pass the whole conv object if needed by App.js handler
            >
              {conv.title || `Conversation ${conv.id}`}
            </div>
          ))
        ) : (
          <p className="no-conversations">No conversations yet.</p>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
