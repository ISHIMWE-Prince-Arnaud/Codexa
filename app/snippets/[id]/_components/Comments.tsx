"use client";

import { SignInButton, useUser } from "@clerk/nextjs";
import { Id } from "../../../../convex/_generated/dataModel";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare } from "lucide-react";
import Comment from "./Comment";
import CommentForm from "./CommentForm";

function Comments({ snippetId }: { snippetId: Id<"snippets"> }) {
  const { user } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<Id<"snippetComments"> | null>(null);
  const [commentToDeleteId, setCommentToDeleteId] = useState<Id<"snippetComments"> | null>(null);

  const comments = useQuery(api.snippets.getComments, { snippetId }) || [];
  const addComment = useMutation(api.snippets.addComment);
  const deleteComment = useMutation(api.snippets.deleteComment);

  const handleSubmitComment = async (content: string) => {
    setIsSubmitting(true);

    try {
      await addComment({ snippetId, content });
    } catch (error) {
      console.log("Error adding comment:", error);
      toast.error("Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: Id<"snippetComments">) => {
    setDeletingCommentId(commentId);

    try {
      await deleteComment({ commentId });
      setCommentToDeleteId(null);
    } catch (error) {
      console.log("Error deleting comment:", error);
      toast.error("Something went wrong");
    } finally {
      setDeletingCommentId(null);
    }
  };

  const commentToDelete = commentToDeleteId
    ? comments.find((c) => c._id === commentToDeleteId)
    : null;

  return (
    <div className="bg-[#121218] border border-[#ffffff0a] rounded-2xl overflow-hidden">
      <div className="px-6 sm:px-8 py-6 border-b border-[#ffffff0a]">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Discussion ({comments.length})
        </h2>
      </div>

      <div className="p-6 sm:p-8">
        {user ? (
          <CommentForm onSubmit={handleSubmitComment} isSubmitting={isSubmitting} />
        ) : (
          <div className="bg-[#0a0a0f] rounded-xl p-6 text-center mb-8 border border-[#ffffff0a]">
            <p className="text-[#808086] mb-4">Sign in to join the discussion</p>
            <SignInButton mode="modal">
              <button className="px-6 py-2 bg-[#3b82f6] text-white rounded-lg hover:bg-[#2563eb] transition-colors">
                Sign In
              </button>
            </SignInButton>
          </div>
        )}

        <div className="space-y-6">
          {comments.map((comment) => (
            <Comment
              key={comment._id}
              comment={comment}
              onDelete={(commentId) => setCommentToDeleteId(commentId)}
              isDeleting={deletingCommentId === comment._id}
              currentUserId={user?.id}
            />
          ))}
        </div>
      </div>

      <AnimatePresence>
        {commentToDelete && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => {
              if (!deletingCommentId) setCommentToDeleteId(null);
            }}
          >
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 10 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="relative w-full max-w-md rounded-2xl border border-[#313244] bg-[#0a0a0f] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-white">Delete comment</h3>
                <p className="text-sm text-gray-400">This action cannot be undone.</p>
              </div>

              <div className="mt-4 rounded-xl border border-[#ffffff0a] bg-[#121218] p-4">
                <div className="text-xs text-gray-500 mb-1">{commentToDelete.userName}</div>
                <div className="text-sm text-gray-200 line-clamp-3">{commentToDelete.content}</div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCommentToDeleteId(null)}
                  disabled={!!deletingCommentId}
                  className="px-4 py-2 rounded-lg bg-gray-800/60 hover:bg-gray-800 text-gray-200 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteComment(commentToDelete._id)}
                  disabled={!!deletingCommentId}
                  className="px-4 py-2 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors disabled:opacity-50"
                >
                  {deletingCommentId ? "Deleting..." : "Delete"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
export default Comments;